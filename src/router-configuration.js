import {findIndex} from "lodash/array"
import {isString, isFunction, isObject} from "lodash/lang"
import CrossRoads from "crossroads"
import {propsRegex, createPart, setRouteProperties} from "./_internals"
import RoutePart from "./route-part"
import Promise from "bluebird"

const router = Symbol("fluxtuateRouter_router");
const routes = Symbol("fluxtuateRouter_routes");
const parser = Symbol("fluxtuateRouter_parser");
const calculatedRoutes = Symbol("fluxtuateRouter_calculatedRoutes");
const name = Symbol("fluxtuateRouter_name");
const formRoute = Symbol("fluxtuateRouter_formRoutes");
const getPageRoute = Symbol("fluxtuateRouter_getPagePath");
const getPathRoute = Symbol("fluxtuateRouter_getRoutePath");
const notFoundRoute = Symbol("fluxtuateRouter_notFoundRoute");
const routeChangeResolve = Symbol("fluxtuateRouter_routeChangeResolve");
const loadRoute = Symbol("fluxtuateRouter_loadRoute");

//match any context
const contextRegex = /<([^>]*)>/gi;

function processRoute(route){
    let r = route;
    if(r === "") r = "/";
    //if the first char is not slash - add slash
    if(r[0] !== "/") {
        r = "/" + r;
    }
    //if the route is just slash that means root and don't remove the last slash
    if (!(r && r.length == 1 && r === "/")) {
        //if the last char is slash - remove it
        if (r[r.length - 1] === "/") {
            r = r.slice(0, r.length - 1);
        }
    }
    return r;
}

function addConfigurationToRoute(route, Config) {
    if(!route.configurations) route.configurations = [];
    route.configurations.push(Config);

    return this;
}

function addEventToRoute(route, eventName) {
    if(!route.events) route.events = [];
    route.events.push(eventName);

    return this;
}

function isNotFound(configuration, route) {
    configuration[notFoundRoute] = route;

    return this;
}

const resolvedPromise = new Promise((resolve)=>resolve());

export default class RouterConfiguration {
    constructor(contextName, containerRouter) {
        this[parser] = CrossRoads.create();
        this[parser].greedyEnabled = false;
        this[parser].ignoreState = true;
        this[parser].bypassed.add((resolveRoute, rejectRoute)=>{
            rejectRoute(new Error("Route not found!"));
        });
        this[parser].normalizeFn = CrossRoads.NORM_AS_OBJECT;
        this[router] = containerRouter;
        this[routes] = [];
        this[routeChangeResolve] = null;
        this[calculatedRoutes] = [];

        this[notFoundRoute] = {
            path: "/404",
            routeDefaults: {},
            contexts: {}
        };

        this[createPart] = (routeObject, params) => {
            let isNotFound = false;
            if(routeObject === this[notFoundRoute]){
                isNotFound = true;
                return new Promise((resolve, reject)=>{
                    reject(new Error("Route not found!"));
                });
            }
            let {pageName, path, routeDefaults, contexts, configurations, events} = routeObject;
            let routeProperties = {
                page: pageName,
                path: path,
                routeDefaults: routeDefaults,
                params: Object.assign({}, params)
            };

            let allContexts = Object.keys(contexts);

            let allContextPromises = [resolvedPromise];

            allContexts.forEach((key)=>{
                let contextObject = contexts[key];
                if(!contextObject.context) {
                    let context = this[router].contexts[contextObject.contextType];
                    if(!context) throw new Error(`No context found with the name: ${contextObject.contextType} in context ${this[name]}!`);
                    contextObject.context = context;
                }
                let prop = `context@${key}*`;
                let contextRoute = routeProperties.params[prop];
                if(contextRoute) {
                    delete routeProperties.params[prop];
                }else{
                    contextRoute = routeProperties.params[key];
                    if(contextRoute){
                        delete routeProperties.params[key];
                    }else{
                        contextRoute = "";
                    }
                }
                routeProperties.params[key] = contextObject.context.generatePart();
                let contextPromise;
                if(isString(contextRoute)){
                    contextPromise = contextObject.context.parse(contextRoute, true);
                }else {
                    if(contextRoute.page) {
                        contextPromise = contextObject.context.resolvePage(contextRoute.page, contextRoute.params);
                    }else if(contextRoute.path) {
                        contextPromise = contextObject.context.resolvePath(contextRoute.path, contextRoute.params);
                    }else if(isObject(contextRoute) && contextObject.context[routes].length > 0){
                        contextPromise = contextObject.context.resolvePath(contextObject.context[routes][0].path, contextRoute);
                    }else {
                        throw new Error(`You must provide a context route or path to redirect to that context properly: ${contextRoute}`)
                    }
                }
                allContextPromises.push(contextPromise.then((routePart)=> {
                    if(routePart.isNotFound){
                        isNotFound = true;
                    }
                    routeProperties.params[key][setRouteProperties](routePart);
                    return true;
                }).caught(()=>false));
            });

            return Promise.all(allContextPromises).then(()=>{
                if(isNotFound){
                    return this.generatePart();
                }else {
                    return new RoutePart(routeProperties, allContexts, configurations, events, this)
                }
            });
        };

        //path = "consultant/{id}"  browserRoute="consultant/3"  route={path: "consultant/{id}", pageName: "consultant", routeDefaults...}  resolveRoute = function...  params={id: 3}
        this[loadRoute] = (route, resolveRoute, rejectRoute, routeName, isSubRoute, params) => {
            for(let key in params){
                if(params.hasOwnProperty(key)) {
                    let param = params[key];

                    if (param === undefined) {
                        delete params[key];
                    }
                }
            }

            this[createPart](route, params).then((part)=>{
                resolveRoute(part);
                return part;
            }).caught(()=>{
                if(isSubRoute) {
                    let e = new Error("Route not found!");
                    rejectRoute(e);
                    return e;
                }else{
                    let part = this.generatePart();
                    resolveRoute(part);
                    return part;
                }
            });
        };

        this[getPathRoute] = (routePath)=>{
            let pageIndex = findIndex(this[routes], {path: routePath});

            if(pageIndex === -1) {
                return this[notFoundRoute];
            }

            return this[routes][pageIndex];
        };

        this[getPageRoute] = (pageName)=>{
            let pageIndex = findIndex(this[routes], {pageName: pageName});

            if(pageIndex === -1) {
                return this[notFoundRoute];
            }

            return this[routes][pageIndex];
        };

        this[formRoute] = (path) => {
            let contextMatch;
            let newRoute = {contexts: {}, props: {}};

            //<consultant-context>/<con2:consultant-context>
            let currentPath = path;
            while ((contextMatch = contextRegex.exec(path)) !== null) {
                let contextName = contextMatch[1].split(":");
                let routeString = contextMatch[0];
                let contextType = contextName[1] || contextName[0];
                contextName = contextName[0];

                let contextProp = ":context@" + contextName + "*:";
                currentPath = currentPath.replace(routeString, contextProp);
                newRoute.contexts[contextName] = {contextType, contextProp};
            }

            newRoute.path = currentPath;

            contextRegex.lastIndex = 0;

            let propMatch;
            while ((propMatch = propsRegex.exec(path)) !== null) {
                var matchValue = propMatch[1] || propMatch[2];
                newRoute.props[matchValue] = propMatch[0];
            }

            propsRegex.lastIndex = 0;

            return newRoute;
        };

        this[name] = contextName;
    }

    generatePart() {
        return new RoutePart(this[notFoundRoute], [], [], [], this, true)
    }

    mapConfig(Config) {
        if(!Config){
            throw new Error("You must provide a configuration class to do this mapping!");
        }

        if(!isFunction(Config.prototype.configure)){
            throw new Error("Configuration must contain a configure method!");
        }

        let self = this;
        return {
            toPath (path) {
                if(!path) throw new Error("You must provide a path to map a config!");
                let route = self[getPageRoute](path);
                if(route === self[notFoundRoute]) {
                    throw new Error(`No such path ${path}`)
                }
                addConfigurationToRoute(route, Config);
                let toPathReturn = {};

                toPathReturn.withEvent = addEventToRoute.bind(toPathReturn, route);
                toPathReturn.isNotFound = isNotFound.bind(toPathReturn, this, route);

                return toPathReturn;
            },
            toPage (pageName) {
                if(!pageName) throw new Error("You must provide a page name to map a config to a page!");
                let route = self[getPageRoute](pageName);
                if(route === self[notFoundRoute]) {
                    throw new Error(`No such page ${pageName}`)
                }
                if(!route.configurations) route.configurations = [];
                route.configurations.push(Config);
                let toPageReturn = {};

                toPageReturn.withEvent = addEventToRoute.bind(toPageReturn, route);
                toPageReturn.isNotFound = isNotFound.bind(toPageReturn, this, route);

                return toPageReturn;
            },
            toAll () {
                self[routes].forEach((route)=>{
                    if(!route.configurations) route.configurations = [];
                    route.configurations.push(Config);
                });
                let toAllReturn = {};
                toAllReturn.withEvent = (eventName)=>{
                    self[routes].forEach((route)=>{
                        addEventToRoute(route, eventName);
                    });
                    return toAllReturn;
                };

                return toAllReturn;
            }
        };
    }

    mapEvent(eventName) {
        if(!eventName){
            throw new Error("You must provide a event name to do this mapping!");
        }

        if(!isString(eventName)){
            throw new Error(`Event name must be a string! ${eventName}`);
        }

        let self = this;
        return {
            toPath (path) {
                if(!path) throw new Error("You must provide a path to map a event!");
                let route = self[getPageRoute](path);
                if(route === self[notFoundRoute]) {
                    throw new Error(`No such path ${path}`)
                }
                addEventToRoute(route, eventName);
                return {
                    withConfiguration: addConfigurationToRoute.bind(undefined, route),
                    isNotFound: isNotFound.bind(undefined, this, route)
                }
            },
            toPage (pageName) {
                if(!pageName) throw new Error("You must provide a page name to map a config to a page!");
                let route = self[getPageRoute](pageName);
                if(route === self[notFoundRoute]) {
                    throw new Error(`No such page ${pageName}`)
                }
                addEventToRoute(route, eventName);
                return {
                    withConfiguration: addConfigurationToRoute.bind(undefined, route),
                    isNotFound: isNotFound.bind(undefined, this, route)
                }
            },
            toAll () {
                self[routes].forEach((route)=>{
                    addEventToRoute(route, eventName);
                });
                return {
                    withConfiguration: (Config)=>{
                        self[routes].forEach((route)=>{
                            addConfigurationToRoute(route, Config);
                        });
                    }
                }
            }
        }
    }

    mapRoute(path, routeDefaults) {
        let routeObject = this[formRoute](path);
        routeObject = Object.assign({routeDefaults}, routeObject);
        this[routes].push(routeObject);

        this[parser].addRoute(routeObject.path, this[loadRoute].bind(this, routeObject));

        return {
            toPage(pageName) {
                routeObject.pageName = pageName;

                return {
                    withConfiguration: addConfigurationToRoute.bind({
                        withEvent: addEventToRoute.bind(undefined, routeObject),
                        isNotFound: isNotFound.bind(undefined, this, routeObject)
                    }, routeObject),
                    withEvent: addEventToRoute.bind({
                        withConfiguration: addConfigurationToRoute.bind(undefined, routeObject),
                        isNotFound: isNotFound.bind(undefined, this, routeObject)
                    }, routeObject),
                    isNotFound: isNotFound.bind({
                        withConfiguration: addConfigurationToRoute.bind({
                            withEvent: addEventToRoute.bind(undefined, routeObject)
                        }, routeObject),
                        withEvent: addEventToRoute.bind({
                            withConfiguration: addConfigurationToRoute.bind(undefined, routeObject)
                        }, routeObject),
                    }, this, routeObject)
                }
            }
        }
    }

    resolvePage(pageName, params) {
        return this[createPart](this[getPageRoute](pageName), params);
    }

    resolvePath(pagePath, params) {
        return this[createPart](this[getPathRoute](this[formRoute](pagePath).path), params);
    }

    parse(route, isSubRoute = false) {
        route = processRoute(route);

        return new Promise((resolve, reject)=> {
            this[parser].parse(route, [resolve, reject, route, isSubRoute]);
        });
    }

    get query() {
        return this[router].query;
    }
}