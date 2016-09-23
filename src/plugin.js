import {Context, inject} from "fluxtuate"
import RetainDelegator from "fluxtuate/lib/delegator/retain-delegator"
import Router from "./router_new"
import RedirectCommand from "./redirect-command"
import {ROUTE_CHANGED} from "./route-enums"

let router;

const routerContextSymbol = Symbol("fluxtuateRouter_routerContext");

export default class RouterPlugin {
    @inject
    eventDispatcher;

    @inject
    contextDispatcher;

    @inject
    context;
    
    @inject
    options;

    @inject
    location;

    mediators = [];

    rootContext;
    
    initialize(injectValue, removeValue) {
        if(this.context[routerContextSymbol]) return;

        if(!router) {
            router = new Router(this.context, this.options.transferQuery, this.options.base);
            injectValue("location", this.location, "Gets the location for the application", false, "command");
        }else{
            injectValue("location", this.location, "Gets the location for the application", false, "command");
        }

        this.removeValue = removeValue;
        injectValue("router", router, "Gets the router for the application", false, "command");



        this.medsDelegator = new RetainDelegator();
        this.appStartedListener = this.contextDispatcher.addListener("started", ()=> {
            this.routeListener = router.addListener(ROUTE_CHANGED, (eventName, payload)=> {
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

            this.mediatorListner = this.contextDispatcher.addListener("mediator_created", (eventName, payload)=> {
                let med = payload.mediator;
                this.mediators.push(med);

                Object.defineProperty(med, "navstack", {
                    get() {
                        return router.params;
                    }
                });

                Object.defineProperty(med, "query", {
                    get() {
                        return router.query;
                    }
                });

                Object.defineProperty(med, "page", {
                    get() {
                        return router.page;
                    }
                });

                Object.defineProperty(med, "route", {
                    get() {
                        return router.route;
                    }
                });

                let self = this;

                Object.defineProperty(med, "redirect", {
                    get() {
                        return (name, params, query)=>{
                            self.eventDispatcher.dispatch("REDIRECT", {
                                name, params, query
                            });
                        }
                    }
                });

                this.medsDelegator.attachDelegate(med);
            });

            this.mediatorDestroyListener = this.contextDispatcher.addListener("mediator_destroyed", (eventName, payload)=> {
                let index = this.mediators.indexOf(payload.mediator);

                if (index !== -1) {
                    this.mediators.splice(index, 1);
                }

                this.medsDelegator.detachDelegate(payload.mediator);
            });
        });
        
        this.appStartingListener = this.contextDispatcher.addListener("starting", ()=>{
            if(!this.context.parent){
                this.context.commandMap.mapEvent("REDIRECT").toCommand(RedirectCommand);
                this.rootContext = new Context();
                this.rootContext[routerContextSymbol] = true;
                this.context[routerContextSymbol] = true;
                this.rootContext.plugin(RouterPlugin);
                this.rootContext.addChild(this.context);
                let routerContext;
                let routerContextRoot;

                // router.addListener("route_context_updated", (eventName, payload) => {
                //     routerContext = payload.endingContext;
                //     if(routerContext) {
                //         if(!routerContextRoot || this.rootContext !== routerContextRoot.parent) {
                //             if(routerContextRoot && routerContextRoot.parent){
                //                 routerContextRoot.parent.removeChild(routerContextRoot);
                //             }
                //             routerContextRoot = payload.startingContext;
                //             if(routerContextRoot.parent !== this.rootContext) {
                //                 if(routerContextRoot.parent){
                //                     routerContextRoot.parent.removeChild(routerContextRoot);
                //                 }
                //                 this.rootContext.addChild(routerContextRoot);
                //             }
                //             if(this.context.parent !== routerContext) {
                //                 if(this.context.parent){
                //                     this.context.parent.removeChild(this.context);
                //                 }
                //                 routerContext.addChild(this.context);
                //             }
                //         }
                //          routerContext.start();
                //     }else{
                //         if(routerContextRoot.parent){
                //             routerContextRoot.parent.removeChild(routerContextRoot);
                //         }
                //         routerContextRoot = null;
                //     }
                // });

                if(!router.started)
                    router.startRouter();
            }
        });
    }
    
    destroy() {
        if(this.context[routerContextSymbol]) return;
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
        }
    }
}