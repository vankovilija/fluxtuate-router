import {Context} from "fluxtuate"
import Config from "./route-config"
import EventDispatcher from "fluxtuate/lib/event-dispatcher"
import {setRouteProperties, propsRegex} from "./_internals"
import {ROUTE_CHANGE, ROUTE_CONTEXT_UPDATED} from "./route-enums"
import {difference} from "lodash/array"
import {destroy} from "fluxtuate/lib/event-dispatcher/_internals"

const currentRoute = Symbol("fluxtuateRouter_currentRoute");
const routeParts = Symbol("fluxtuateRouter_routeParts");
const contextRoute = Symbol("fluxtuateRouter_contextRoute");
const fluxtuateContextRoute = Symbol("fluxtuateRouter_fluxtuateContextRoute");
const configurationsRoute = Symbol("fluxtuateRouter_configurationsRoute");
const newConfigurationsRoute = Symbol("fluxtuateRouter_newConfigurationsRoute");
const eventsRoute = Symbol("fluxtuateRouter_eventsRoute");
const contextsRoute = Symbol("fluxtuateRouter_contextsRoute");
const requestUpdate = Symbol("fluxtuateRouter_requestUpdate");
const partListeners = Symbol("fluxtuateRouter_partListeners");
const fluxtuateRouterContext = Symbol("fluxtuateRouter_context");
const fluxtuateRouterContextTail = Symbol("fluxtuateRouter_contextTail");

export default class RoutePart extends EventDispatcher {
    constructor (routeProperties = {}, contexts = [], configurations = [], events = [], context = {}) {
        super();
        this[partListeners] = [];
        this[contextsRoute] = [];
        this[configurationsRoute] = [];
        this[fluxtuateContextRoute] = [];
        this[routeParts] = {};
        this[currentRoute] = {};
        this[contextRoute] = context;
        this[fluxtuateRouterContext] = new Context().config(Config(this));
        //...all other contexts with configurations
        this[fluxtuateRouterContextTail] = new Context();

        this[fluxtuateRouterContext].addChild(this[fluxtuateRouterContextTail]);

        this[fluxtuateRouterContextTail].start();

        this[setRouteProperties] = (routeProperties, contexts, configurations, events) => {
            if (routeProperties[currentRoute]) {
                contexts = routeProperties[contextsRoute];
                configurations = routeProperties[newConfigurationsRoute];
                events = routeProperties[eventsRoute];
                routeProperties = routeProperties[currentRoute];
            }
            while (this[partListeners].length > 0) {
                this[partListeners].pop().remove();
            }

            let propertiesKeys = Object.keys(routeProperties);

            this[contextsRoute].forEach((contextProp)=> {
                let contextPart = this[currentRoute].params[contextProp];
                let propIndex = propertiesKeys.indexOf(contextProp);
                let shouldDestroy = true;
                if (propIndex !== -1) {
                    if (contextPart[contextRoute] === routeProperties[contextProp][contextRoute]) {
                        contextPart[contextRoute][setRouteProperties](routeProperties[contextProp][contextRoute]);
                        propertiesKeys.splice(propIndex, 1);
                        shouldDestroy = false;
                    }
                }
                if (shouldDestroy)
                    contextPart[destroy]();
            });
            propertiesKeys.forEach((propKey)=> {
                this[currentRoute][propKey] = routeProperties[propKey];
            });
            this[contextsRoute] = contexts;
            this[routeParts] = {};
            this[contextsRoute].forEach((contextProp)=> {
                this[partListeners].push(this[contextsRoute].params[contextProp].addEventListener(ROUTE_CHANGE, this[requestUpdate]));
                this[routeParts][contextProp] = this[contextsRoute].params[contextProp];
            });

            this[eventsRoute] = events;
            this[newConfigurationsRoute] = configurations;
        };


        this[requestUpdate] = () => {
            this.dispatch(ROUTE_CHANGE, this);
        };

        this[setRouteProperties](routeProperties, contexts, configurations, events);
    }

    start() {
        let routeChangePromises = Object.keys(this[routeParts]).map((key)=>this[routeParts][key].start());

        let addingDifference = difference(this[newConfigurationsRoute], this[configurationsRoute]);
        let excludingDifference = difference(this[configurationsRoute], this[newConfigurationsRoute]);

        if(addingDifference.length > 0 || excludingDifference.length > 0){
            excludingDifference.forEach((config)=>{
                let i = this[configurationsRoute].indexOf(config);
                let context = this[fluxtuateContextRoute][i];

                let fullContextChildren = context.children.slice();
                fullContextChildren.forEach(c=> {
                    context.removeChild(c);
                    context.parent.addChild(c);
                });

                context.destroy();

                this[fluxtuateContextRoute].splice(i, 1);
                this[configurationsRoute].splice(i, 1);
            });

            addingDifference.forEach((configObject)=>{
                let newContext = new Context();
                newContext.config(configObject);
                let fluxContexts = this[fluxtuateContextRoute].length;
                let parent = fluxContexts > 0 ? this[fluxtuateContextRoute][fluxContexts - 1] : this[fluxtuateRouterContext];
                this[configurationsRoute].push(configObject);
                this[fluxtuateContextRoute].push(newContext);
                if(parent){
                    parent.children.forEach(c=>{
                        parent.removeChild(c);
                        newContext.addChild(c);
                    });
                    parent.addChild(newContext);
                }
            });
            this.endingContext.start();
            this.dispatch(ROUTE_CONTEXT_UPDATED, Object.assign({
                startingContext: this.startingContext,
                endingContext: this.endingContext
            }, this.currentRoute));
        }

        routeChangePromises.push(new Promise((resolve)=>{
            if(this[eventsRoute].length === 0){
                resolve();
            }else {
                setTimeout(()=> {
                    this[eventsRoute].forEach((event)=> {
                        let innerPromises = [];
                        this[fluxtuateContextRoute].forEach((context)=> {
                            innerPromises.push(new Promise((resolve)=> {
                                setTimeout(()=> {
                                    if (context.commandMap.hasEvent(event)) {
                                        context.commandMap.onComplete(resolve);
                                    } else {
                                        resolve();
                                    }
                                }, 0);
                            }));
                        });
                        this.startingContext.dispatch(event, this.currentRoute);
                        Promise.all(innerPromises).then(()=> {
                            resolve();
                        })
                    });
                }, 0);
            }
        }));

        return Promise.all(routeChangePromises).then(()=>{
            Object.keys(this[routeParts]).forEach((key)=>{
                this.endingContext.addChild(this[routeParts][key].startingContext);
            });
        });
    }

    goToPage (pageName, params) {
        this.goToRoute(this[contextRoute].resolvePage(pageName, params));
    }

    goToPath (pagePath, params) {
        this.goToRoute(this[contextRoute].resolvePath(pagePath, params));
    }

    goToRoute (route) {
        this[setRouteProperties](route);
        this[requestUpdate]();
    }

    get currentRoute() {
        let returnObject = Object.assign({context: this.endingContext}, this[currentRoute]);
        let params = {};
        Object.keys(this[routeParts]).forEach((key)=>{
            params[key] = this[routeParts][key].currentRoute;
        });
        returnObject.params = Object.assign(params, returnObject.params);
        return returnObject;
    }

    get locationContext() {
        return this[fluxtuateRouterContext];
    }

    get startingContext() {
        return this[fluxtuateRouterContext];
    }

    get endingContext() {
        return this[fluxtuateRouterContextTail];
    }

    toString () {
        let params = Object.assign({}, this[currentRoute].params);
        this[contextsRoute].forEach((contextName)=>{
            params[contextName] = params[contextName].toString();
        });

        let pagePath = this[currentRoute].path;

        let checkPath = pagePath;
        let pageMatch;
        while ((pageMatch = propsRegex.exec(checkPath)) !== null) {
            var matchValue = pageMatch[1] || pageMatch[2];
            if (params.hasOwnProperty(matchValue) && params[matchValue] !== undefined && params[matchValue] !== null) {
                pagePath = pagePath.replace(pageMatch[0], params[matchValue]);
            } else {
                pagePath = pagePath.replace(pageMatch[0] + "/", "");
                pagePath = pagePath.replace(pageMatch[0], "");
            }
        }

        propsRegex.lastIndex = 0;

        return pagePath;
    }
}