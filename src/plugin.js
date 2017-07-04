import {inject} from "fluxtuate"
import {routeContext} from "./_internals"
import {isFunction} from "lodash/lang"
import {mediators as ContextMediators} from "fluxtuate/lib/context/_internals"
import {context as MediatorContext} from "fluxtuate/lib/mediator/_internals"
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
                return location.toJSON().params;
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

        setTimeout(()=>{
            if(med.hasNavstack || med.destroyed) return;

            if(isFunction(med.onNavStackChange)) {
                med.onNavStackChange(location.currentRoute);
            }

            med.hasNavstack = true;
        }, 30);
    }

    removeMediator(med) {
        let index = this.mediators.indexOf(med);

        if (index !== -1) {
            this.mediators.splice(index, 1);
        }
    }
    
    initialize(injectValue, removeValue) {
        if(this.context[routerContextSymbol]) return;

        let isRoot = false;
        if (!router) {
            isRoot = true;
            router = new Router(this.context, this.options.transferQuery, this.options.base, this.options.useHistory);
            injectValue("location", router.location, "Gets the location for the application", false);
        }

        this.destroyed = false;

        this.removeValue = removeValue;
        injectValue("router", router, "Gets the router for the application", false, "command");

        this.context.commandMap.mapEvent("REDIRECT").toCommand(RedirectCommand).stopPropagation();

        if(!router.started)
            router.startRouter();

        if(!this.context.isStarted) {
            this.appStartingListener = this.contextDispatcher.addListener("starting", ()=>{
                if(!this.context[routeContext] && !isRoot){
                    injectValue("location", this.location, "Gets the location for the application", false);
                }
            });
            this.appStartedListener = this.contextDispatcher.addListener("started", ()=> {
                this.startPlugin();
            });
        }else{
            this.startPlugin();
        }
    }

    configureRoute(routeProps) {
        if (this.destroyed) return;

        this.mediators.forEach((med)=> {
            if(med.destroyed) return;

            if(isFunction(med.onNavStackChange)) {
                med.onNavStackChange(routeProps);
            }
            med.hasNavstack = true;
        });

        this.previousRoute = {
            params: routeProps.params,
            routeDefaults: routeProps.routeDefaults
        };
    }

    startPlugin() {
        if(this.routeListener){
            this.routeListener.remove();
        }

        let location = this.location ? this.location : router.location;

        this.routeListener = location.addListener(ROUTE_CHANGED, (eventName, payload)=> {
            setTimeout(()=> {
                this.configureRoute(payload);
            }, 30);
        }, -10000);

        this.configureRoute(location.currentRoute);

        if(this.mediatorListner){
            this.mediatorListner.remove();
        }

        this.mediatorListner = this.contextDispatcher.addListener("mediator_created", (eventName, payload)=> {
            this.setupMediator(payload.mediator);
        }, 1000000);

        if(this.mediatorDestroyListener){
            this.mediatorDestroyListener.remove();
        }

        this.mediatorDestroyListener = this.contextDispatcher.addListener("mediator_destroyed", (eventName, payload)=> {
            this.removeMediator(payload.mediator);
        }, 10000000);

        this.context[ContextMediators].forEach((med)=>{
            this.setupMediator(med);
        });
    }
    
    destroy() {
        if(this.context[routerContextSymbol]) return;
        this.context.commandMap.unmapEvent("REDIRECT", RedirectCommand);
        this.mediators.forEach((med)=>{
            this.removeMediator(med);
        });
        this.destroyed = true;
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
        if(this.appStartingListener) {
            this.appStartingListener.remove();
            this.appStartingListener = null;
        }
        if(this.appStartedListener) {
            this.appStartedListener.remove();
            this.appStartedListener = null;
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