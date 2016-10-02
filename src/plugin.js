import {inject} from "fluxtuate"
import {routeContext} from "./_internals"
import {mediators as ContextMediators} from "fluxtuate/lib/context/_internals"
import {context as MediatorContext} from "fluxtuate/lib/mediator/_internals"
import RetainDelegator from "fluxtuate/lib/delegator/retain-delegator"
import Router from "./router"
import RedirectCommand from "./redirect-command"
import {ROUTE_CHANGED} from "./route-enums"
import {autobind} from "core-decorators"

let router;

const routerContextSymbol = Symbol("fluxtuateRouter_routerContext");

@autobind
export default class RouterPlugin {
    @inject
    contextDispatcher;

    @inject
    context;
    
    @inject
    options;

    @inject
    location;

    mediators = [];

    setupMediator(med) {
        if(this.context !== med[MediatorContext]) return;

        if(this.mediators.indexOf(med) !== -1) return;

        this.mediators.push(med);

        let location = this.location ? this.location : router.location;

        Object.defineProperty(med, "navstack", {
            get() {
                return location.currentRoute.params;
            },
            configurable: true
        });

        Object.defineProperty(med, "query", {
            get() {
                return router.query;
            },
            configurable: true
        });

        Object.defineProperty(med, "page", {
            get() {
                return location.currentRoute.page;
            },
            configurable: true
        });

        Object.defineProperty(med, "path", {
            get() {
                return location.currentRoute.path;
            },
            configurable: true
        });

        let self = this;

        Object.defineProperty(med, "redirect", {
            get() {
                return (name, params)=>{
                    self.context.dispatch("REDIRECT", {
                        name, params
                    })
                }
            },
            configurable: true
        });

        this.medsDelegator.attachDelegate(med);
    }

    removeMediator(med) {
        let index = this.mediators.indexOf(med);

        if (index !== -1) {
            this.mediators.splice(index, 1);
        }

        this.medsDelegator.detachDelegate(med);
    }
    
    initialize(injectValue, removeValue) {
        if(this.context[routerContextSymbol]) return;

        if(!this.context[routeContext]) {
            if (!router) {
                router = new Router(this.context, this.options.transferQuery, this.options.base);
                injectValue("location", router.location, "Gets the location for the application", false);
            } else {
                injectValue("location", this.location, "Gets the location for the application", false);
            }
        }

        this.removeValue = removeValue;
        injectValue("router", router, "Gets the router for the application", false, "command");

        this.appStartingListener = this.contextDispatcher.addListener("starting", ()=>{
            this.context.commandMap.mapEvent("REDIRECT").toCommand(RedirectCommand).stopPropagation();

            if(!router.started)
                router.startRouter();
        });

        this.medsDelegator = new RetainDelegator();
        if(!this.context.isStarted) {
            this.appStartedListener = this.contextDispatcher.addListener("started", ()=> {
                this.startPlugin();
            });
        }else{
            this.startPlugin();
        }
    }

    startPlugin() {
        if(this.routeListener){
            this.routeListener.remove();
        }

        let location = this.location ? this.location : router.location;

        this.routeListener = location.addListener(ROUTE_CHANGED, (eventName, payload)=> {
            setTimeout(()=> {
                if (!this.medsDelegator) return;

                this.medsDelegator.dispatch("onNavStackChange", payload);
                this.previousRoute = {
                    params: payload.params,
                    routeDefaults: payload.routeDefaults
                };
                this.mediators.forEach((med)=> {
                    med.hasNavstack = true;
                });
            }, 10);
        }, -10000);

        if(this.mediatorListner){
            this.mediatorListner.remove();
        }

        this.mediatorListner = this.contextDispatcher.addListener("mediator_created", (eventName, payload)=> {
            this.setupMediator(payload.mediator);
        });

        if(this.mediatorDestroyListener){
            this.mediatorDestroyListener.remove();
        }

        this.mediatorDestroyListener = this.contextDispatcher.addListener("mediator_destroyed", (eventName, payload)=> {
            this.removeMediator(payload.mediator);
        });

        this.context[ContextMediators].forEach((med)=>{
            this.setupMediator(med);
        });
    }
    
    destroy() {
        if(this.context[routerContextSymbol]) return;
        this.mediators.forEach((med)=>{
            this.removeMediator(med);
        });
        this.mediators = [];
        if(this.mediatorListner) {
            this.mediatorListner.remove();
            this.mediatorListner = null;
        }
        if(this.mediatorInitilizedListner) {
            this.mediatorInitilizedListner.remove();
            this.mediatorInitilizedListner = null;
        }
        if(this.mediatorDestroyListener) {
            this.mediatorDestroyListener.remove();
            this.mediatorDestroyListener = null;
        }
        if(this.routeListener) {
            this.routeListener.remove();
            this.routeListener = null;
        }
        if(this.routeListener1) {
            this.routeListener1.remove();
            this.routeListener1 = null;
        }
        if(this.appStartedListener) {
            this.appStartedListener.remove();
            this.appStartedListener = null;
        }
        if(this.appStartingListener) {
            this.appStartingListener.remove();
            this.appStartingListener = null;
        }
        if(this.medsDelegator){
            this.medsDelegator.destroy();
            this.medsDelegator = null;
        }
        if(this.addingChildListener) {
            this.addingChildListener.remove();
            this.addingChildListener = null;
        }
        if(this.removingChildListener) {
            this.removingChildListener.remove();
            this.removingChildListener = null;
        }

        if(this.removeValue) {
            this.removeValue("router");
            if(!this.context[routeContext]) this.removeValue("location");
        }
    }
}