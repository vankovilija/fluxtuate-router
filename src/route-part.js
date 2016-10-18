import {Context} from "fluxtuate"
import Config from "./route-config"
import EventDispatcher from "fluxtuate/lib/event-dispatcher"
import {setRouteProperties, propsRegex, routeContext} from "./_internals"
import {ROUTE_CHANGE, ROUTE_CONTEXT_UPDATED, ROUTE_CHANGED} from "./route-enums"
import {difference} from "lodash/array"
import {destroy} from "fluxtuate/lib/event-dispatcher/_internals"
import {autobind} from "core-decorators"

const currentRoute = Symbol("fluxtuateRouter_currentRoute");
const routeUpdated = Symbol("fluxtuateRouter_routeUpdated");
const routeParts = Symbol("fluxtuateRouter_routeParts");
const contextRoute = Symbol("fluxtuateRouter_contextRoute");
const fluxtuateContextRoute = Symbol("fluxtuateRouter_fluxtuateContextRoute");
const configurationsRoute = Symbol("fluxtuateRouter_configurationsRoute");
const newConfigurationsRoute = Symbol("fluxtuateRouter_newConfigurationsRoute");
const eventsRoute = Symbol("fluxtuateRouter_eventsRoute");
const contextsRoute = Symbol("fluxtuateRouter_contextsRoute");
const requestUpdate = Symbol("fluxtuateRouter_requestUpdate");
const dispatchUpdate = Symbol("fluxtuateRouter_dispatchUpdate");
const partListeners = Symbol("fluxtuateRouter_partListeners");
const fluxtuateRouterContext = Symbol("fluxtuateRouter_context");
const fluxtuateRouterContextTail = Symbol("fluxtuateRouter_contextTail");
const partName = Symbol("fluxtuateRouter_partName");
const notFound = Symbol("fluxtuateRouter_notFound");

const contextPrepend = new RegExp("\\/:context@", "g");
const contextSuffix = new RegExp("\\*:", "g");

@autobind
export default class RoutePart extends EventDispatcher {
    constructor (routeProperties = {}, contexts = [], configurations = [], events = [], context = {}, isNotFound = false) {
        super();
        this[notFound] = isNotFound;
        this[partListeners] = [];
        this[contextsRoute] = [];
        this[configurationsRoute] = [];
        this[fluxtuateContextRoute] = [];
        this[routeUpdated] = false;
        this[routeParts] = {};
        this[currentRoute] = {};
        this[contextRoute] = context;
        this[partName] = "root";

        this[fluxtuateRouterContext] = new Context().config(Config(this));
        this[fluxtuateRouterContext][routeContext] = true;
        //...all other contexts with configurations
        this[fluxtuateRouterContextTail] = new Context();

        this[fluxtuateRouterContext].addChild(this[fluxtuateRouterContextTail]);

        this[setRouteProperties] = (routeProperties, contexts, configurations, events) => {
            if (routeProperties[currentRoute]) {
                this[notFound] = routeProperties[notFound];
                contexts = routeProperties[contextsRoute];
                configurations = routeProperties[newConfigurationsRoute];
                events = routeProperties[eventsRoute];
                routeProperties = routeProperties[currentRoute];
            }
            while (this[partListeners].length > 0) {
                this[partListeners].pop().remove();
            }

            let newPrams = routeProperties.params || {};
            let oldParams = this[currentRoute].params || {};

            let newParamsKeys = Object.keys(newPrams);

            this[contextsRoute].forEach((contextProp)=> {
                let contextPart = this[currentRoute].params[contextProp];
                let propIndex = newParamsKeys.indexOf(contextProp);
                if (propIndex !== -1 && contextPart[contextRoute] === newPrams[contextProp][contextRoute]) {
                    contextPart[setRouteProperties](newPrams[contextProp]);
                    newPrams[contextProp] = contextPart;
                    newParamsKeys.splice(propIndex, 1);
                }else
                    contextPart[destroy]();
            });

            if(this[currentRoute].page !== routeProperties.page || this[currentRoute].path !== routeProperties.path){
                this[routeUpdated] = true;
            }

            newParamsKeys.forEach((propKey)=> {
                if(oldParams[propKey] !== newPrams[propKey]) {
                    this[routeUpdated] = true;
                }
            });

            this[currentRoute].params = newPrams;

            Object.keys(routeProperties).forEach((routeKey)=>{
                if(routeKey !== "params") {
                    this[currentRoute][routeKey] = routeProperties[routeKey];
                }
            });
            this[contextsRoute] = contexts;
            this[routeParts] = {};
            this[contextsRoute].forEach((contextProp)=> {
                this[partListeners].push(this[currentRoute].params[contextProp].addListener(ROUTE_CHANGED, this[dispatchUpdate]));
                this[partListeners].push(this[currentRoute].params[contextProp].addListener(ROUTE_CHANGE, this[requestUpdate]));
                this[currentRoute].params[contextProp].setName(contextProp);
                this[routeParts][contextProp] = this[currentRoute].params[contextProp];
            });

            this[eventsRoute] = events;
            this[newConfigurationsRoute] = configurations;
        };


        this[requestUpdate] = () => {
            this.dispatch(ROUTE_CHANGE, this);
        };

        this[dispatchUpdate] = () => {
            this.dispatch(ROUTE_CHANGED, this.currentRoute);
        };

        this[setRouteProperties](routeProperties, contexts, configurations, events);
    }

    setName(name) {
        this[partName] = name;
    }

    start() {

        this[fluxtuateRouterContextTail].start();

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
            if(this[routeUpdated]) {
                this[dispatchUpdate]();
                this[routeUpdated] = false;
            }
        });
    }

    goToPage (pageName, params) {
        this[contextRoute].resolvePage(pageName, params).then(this.goToRoute);
    }

    goToPath (pagePath, params) {
        this[contextRoute].resolvePath(pagePath, params).then(this.goToRoute);
    }

    goToRoute (route) {
        this[setRouteProperties](route);
        this[requestUpdate]();
    }

    get currentRoute() {
        let returnObject = Object.assign({context: this.endingContext, query: this[contextRoute].query}, this[currentRoute]);
        let params = {};
        Object.keys(this[routeParts]).forEach((key)=>{
            params[key] = this[routeParts][key].currentRoute;
        });
        returnObject.params = Object.assign(params, returnObject.params);
        return returnObject;
    }

    get partName() {
        return this[partName];
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

    get isNotFound() {
        return this[notFound];
    }

    toString () {
        let params = Object.assign({}, this[currentRoute].params);
        this[contextsRoute].forEach((contextName)=>{
            params[contextName] = params[contextName].toString();
        });

        let pagePath = this[currentRoute].path;
        pagePath = pagePath.replace(contextPrepend, "/:");
        pagePath = pagePath.replace(contextSuffix, ":");

        let checkPath = pagePath;
        let pageMatch;
        while ((pageMatch = propsRegex.exec(checkPath)) !== null) {
            var matchValue = pageMatch[1] || pageMatch[2];
            if (params.hasOwnProperty(matchValue) && params[matchValue] !== undefined && params[matchValue] !== null && params[matchValue] !== "/") {
                let match = params[matchValue];
                if(match[0] === "/") match = match.slice(1);
                if(match[match.length - 1] === "/") match = match.slice(0, -1);
                pagePath = pagePath.replace(pageMatch[0], match);
            } else {
                pagePath = pagePath.replace(pageMatch[0] + "/", "");
                pagePath = pagePath.replace(pageMatch[0], "");
            }
        }

        propsRegex.lastIndex = 0;

        return pagePath;
    }
}