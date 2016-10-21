import {Context} from "fluxtuate"
import EventDispatcher from "fluxtuate/lib/event-dispatcher/retain-event-dispatcher"
import History from "./history"
import Crossroads from "crossroads"
import JSON_URI from "json-uri"
import {autobind} from "core-decorators"
import { isArray, isObject } from "lodash/lang";
import {isFunction} from "lodash/lang"
import {differenceBy, findIndex} from "lodash/array"
import Promise from "bluebird"

Crossroads.greedyEnabled = false;
Crossroads.normalizeFn = Crossroads.NORM_AS_OBJECT;

const pagesKey = Symbol("fluxtuateRouter_pages");
const routes = Symbol("fluxtuateRouter_routes");
const notFoundRoute = Symbol("fluxtuateRouter_notFoundRoute");
const activeURI = Symbol("fluxtuateRouter_activeURI");
const activeRoute = Symbol("fluxtuateRouter_activeRoute");
const activePage = Symbol("fluxtuateRouter_activePage");
const activeParams = Symbol("fluxtuateRouter_activeParams");
const loadRoute = Symbol("fluxtuateRouter_loadPage");
const calculateURIState = Symbol("fluxtuateRouter_calculateURIState");
const getPagePath = Symbol("fluxtuateRouter_getPagePath");
const configToRoute = Symbol("fluxtuateRouter_configToRoute");
const configToPage = Symbol("fluxtuateRouter_configToRoute");
const started = Symbol("fluxtuateRouter_started");
const routeContext = Symbol("fluxtuateRouter_routeContext");
const routeConfig = Symbol("fluxtuateRouter_routeConfig");
const query = Symbol("fluxtuateRouter_query");
const baseURL = Symbol("fluxtuateRouter_base");
const rootContext = Symbol("fluxtuateRouter_rootContext");

const propsRegex = /{([^}]*)}|:([^:]*):/gi;

function compressParams(keys, index, params, cb){
    if(index >= keys.length){
        cb(params);
        return;
    }

    var param = params[keys[index]];
    if(isObject(param) || isArray(param)){
        if(param.length === 0 || Object.keys(param).length === 0){
            params[keys[index]] = "";
            compressParams(keys, index + 1, params, cb);
        }else {
            params[keys[index]] = JSON_URI.encode(JSON.stringify(param));
            compressParams(keys, index + 1, params, cb);
        }
    }else{
        compressParams(keys, index + 1, params, cb);
    }
}

function processRoute(r, queryParams = {}) {
    let route = r;
    //if the first char is not slash - add slash
    if(route[0] !== "/") {
        route = "/" + route;
    }
    //if the route is just slash that means root and don't remove the last slash
    if (!(route && route.length == 1 && route === "/")) {
        //if the last char is slash - remove it
        if (route[route.length - 1] === "/") {
            route = route.slice(0, route.length - 1);
        }
    }


    let count = 0;
    for (let key in queryParams) {

        if(count > 0) {
            route += "&";
        }else{
            route += "?";
        }

        route += `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`;

        count ++;
    }
    
    return route;
}

@autobind
export default class Router extends EventDispatcher {
    constructor(context, transferQuery = [], base = "") {
        super();
        this[rootContext] = context;
        this[activeURI] = "";
        this[activeParams] = {};
        this[routes] = {};
        this[pagesKey] = {};
        this[notFoundRoute] = "/404";
        this[started] = false;
        this[configToRoute] = {};
        this[configToPage] = {};
        this[routeContext] = [];
        this[routeConfig] = [];
        this[query] = {};
        this[baseURL] = base;
        
        this.transferQuery = transferQuery;

        Object.defineProperty(this, "query", {
            get() {
                return Object.assign({}, this[query]);
            }
        });

        this[getPagePath] = (pageName, params, cb)=>{
            let allPages = this[pagesKey];

            if (!allPages.hasOwnProperty(pageName)) {
                this.goToRoute(this[notFoundRoute]);
                return;
            }

            let pagePath = allPages[pageName];

            if(params === undefined){
                params = {};
            }

            compressParams(Object.keys(params), 0, params, function(params) {

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

                cb(pagePath);
            }.bind(this));
        };

        this[calculateURIState] = () => {
            var State = History.getState();
            var uriArray = State.hash.split("?");
            let uri = uriArray[0];
            let queryArray = uriArray[1];
            this[query] = {};
            if(queryArray) {
                queryArray = queryArray.split("&");
                queryArray.forEach((q)=> {
                    let qa = q.split("=");
                    this[query][qa[0]] = decodeURIComponent(qa[1]);
                });
            }
            uri = uri.replace(this[baseURL], "");
            if(activeURI !== uri)
                Crossroads.parse(uri);
            this[activeURI] = uri;
        };

        Crossroads.bypassed.add(()=>{
            this.replaceRoute(this[notFoundRoute]);
        });

        this[loadRoute] = (route, params)=>{
            let pageName;
            for(let k in this[pagesKey]){
                if(this[pagesKey][k] === route){
                    pageName = k;
                    break;
                }
            }

            for(let key in params){
                let param = params[key];

                if(param === undefined){
                    delete params[key];
                    continue;
                }

                let isJSON = true;
                try {
                    param = JSON_URI.decode(param);
                    try {
                        param = JSON.parse(param);
                    }catch(e){
                        isJSON = false;
                    }
                }catch (e){
                    isJSON = false;
                }

                if(!isJSON){
                    param = params[key];
                }

                params[key] = param;
            }

            let newConfig = [].concat(this[configToRoute][route], this[configToPage][pageName]);

            let routeProperties = {
                page: pageName,
                path: route,
                routeDefaults: this[routes][route],
                params: params,
                query: this[query]
            };

            this.dispatch("route_will_change", routeProperties);

            newConfig.filter((con)=>con && !con.config).forEach((con) =>{
                if(con.event){
                    this[rootContext].dispatch(con.event, routeProperties);
                }
            });
            
            newConfig = newConfig.filter((con) => con && con.config?true:false);

            let addingDifference = differenceBy(newConfig, this[routeConfig], (con)=>con.config);
            let excludingDifference = differenceBy(this[routeConfig], newConfig, (con)=>con.config);

            let leftConfig = this[routeConfig].filter((con)=>excludingDifference.indexOf(con) === -1);

            let routeChangePromises = [new Promise((resolve)=>resolve())];

            for(let i = 0; i < leftConfig.length; i++) {
                let index = findIndex(newConfig, {config: leftConfig[i].config});
                let rIndex = this[routeConfig].indexOf(leftConfig[i]);
                this[routeConfig].splice(rIndex, 1, newConfig[index]);
                if(newConfig[index].event) {
                    let context = this[routeContext][rIndex];

                    context.dispatch(newConfig[index].event, routeProperties);

                    routeChangePromises.push(new Promise((resolve)=>{
                        let configObject = newConfig[index];
                        let completeListener = context.commandMap.addListener("complete", (ev, payload)=>{
                            if(payload.event === configObject.event){
                                resolve();
                                completeListener.remove();
                            }
                        });
                        setTimeout(function(event){
                            if(!context.commandMap.hasEvent(event)) {
                                resolve();
                                completeListener.remove();
                            }
                        }.bind(this, configObject.event), 0);
                    }));
                }
            }

            if(addingDifference.length > 0 || excludingDifference.length > 0){
                excludingDifference.forEach((config)=>{
                    let i = this[routeConfig].indexOf(config);
                    let context = this[routeContext][i];

                    let fullContextChildren = context.children.slice();
                    fullContextChildren.forEach(c=> {
                        context.removeChild(c);
                        context.parent.addChild(c);
                    });

                    context.destroy();

                    this[routeContext].splice(i, 1);
                    this[routeConfig].splice(i, 1);
                });

                addingDifference.forEach((configObject)=>{
                    let newContext = new Context();
                    newContext.config(configObject.config);
                    if(configObject.event){
                        setTimeout(()=>{
                            newContext.dispatch(configObject.event, routeProperties);
                        }, 0);
                        routeChangePromises.push(new Promise((resolve)=>{
                            let completeListener = newContext.commandMap.addListener("complete", (ev, payload)=>{
                                if(payload.event === configObject.event){
                                    resolve();
                                    completeListener.remove();
                                }
                            });
                            setTimeout(function(event){
                                if(!newContext.commandMap.hasEvent(event)) {
                                    resolve();
                                    completeListener.remove();
                                }
                            }.bind(this, configObject.event), 0);
                        }));
                    }
                    let parent = this.routeLastContext;
                    this[routeConfig].push(configObject);
                    this[routeContext].push(newContext);
                    if(parent){
                        parent.children.forEach(c=>{
                            parent.removeChild(c);
                            newContext.addChild(c);
                        });
                        parent.addChild(newContext);
                    }
                });
                this.dispatch("route_context_updated", Object.assign({
                    startingContext: this.routeFirstContext,
                    endingContext: this.routeLastContext
                }, routeProperties));
            }

            Promise.all(routeChangePromises).then(()=>{
                this.dispatch("route_changed", routeProperties);
            });

            this[activeRoute] = route;
            this[activePage] = pageName;
            this[activeParams] = params;
        }
    }

    startRouter() {
        History.Adapter.bind(window,"statechange",this[calculateURIState]);
        History.Adapter.onDomLoad(this[calculateURIState]);
        this[started] = true;
    }
    
    isRouteContext(context) {
        return this[routeContext].indexOf(context) !== -1;
    }
    
    get routeFirstContext() {
        if(this[routeContext].length === 0) return undefined;
        return this[routeContext][0];
    }

    get routeLastContext() {
        if(this[routeContext].length === 0) return undefined;
        return this[routeContext][this[routeContext].length - 1];
    }
    
    get started() {
        return this[started];
    }
    
    mapConfig(Config) {
        if(!Config){
            throw new Error("You must provide a configuration class to do this mapping!");
        }
        
        if(!isFunction(Config.prototype.configure)){
            throw new Error("Configuration must contain a configure method!");
        }

        let returnObject = {config: Config};
        
        let self = this;
        return {
            toRoute (route) {
                if(!route) throw new Error("You must provide a route to map a config to a route!");
                if(!self[configToRoute][route]) self[configToRoute][route] = [];
                self[configToRoute][route].push(returnObject);
                return {
                    withEvent(eventName) {
                        returnObject.event = eventName;
                    }
                }
            },
            toPage (pageName) {
                if(!pageName) throw new Error("You must provide a page name to map a config to a page!");
                if(!self[configToPage][pageName]) self[configToPage][pageName] = [];
                self[configToPage][pageName].push(returnObject);
                return {
                    withEvent(eventName) {
                        returnObject.event = eventName;
                    }
                }
            }
        };
    }

    mapEvent(eventName) {
        return {
            toPage(pageName) {
                if(!self[configToPage][pageName]) self[configToPage][pageName] = [];
                self[configToPage][pageName].push({event: eventName});
            },
            toRoute(route) {
                if(!self[configToRoute][route]) self[configToRoute][route] = [];
                self[configToRoute][route].push({event: eventName});
            }
        }
    }

    mapRoute(route, params){
        if(!params){
            params = {};
        }

        if(this[routes][route]){
            throw new Error(`Route ${route} is already defined!`);
        }

        this[routes][route] = params;
        Crossroads.addRoute(route, this[loadRoute].bind(this, route));
        let self = this;
        return Object.assign({
            toPage(pageName) {
                self[pagesKey][pageName] = route;

                return Object.assign({
                    isNotFound() {
                        this[notFoundRoute] = route;
                        return self;
                    },
                    withEvent(eventName) {
                        if(!self[configToRoute][route]) self[configToRoute][route] = [];
                        self[configToRoute][route].push({event: eventName});
                    }
                }, self);
            },
            isNotFound() {
                this[notFoundRoute] = route;
                return self;
            },
            withEvent(eventName) {
                if(!self[configToRoute][route]) self[configToRoute][route] = [];
                self[configToRoute][route].push({event: eventName});
            }
        }, this);
    }

    goToRoute(route, query = {}){
        let defQuery = {};
        this.transferQuery.forEach((qN)=>{
            if(this.query[qN])
                defQuery[qN] = this.query[qN];
        });
        
        route = processRoute(route, Object.assign({}, query, defQuery));

        route = this[baseURL] + route;
        setTimeout(()=>{
            History.pushState(undefined, document.title, route);
        }, 0);
    }

    goBack() {
        History.back();
    }

    replaceRoute(route, query = {}){
        let defQuery = {};
        this.transferQuery.forEach((qN)=>{
            defQuery[qN] = this.query[qN];
        });
        
        route = processRoute(route, Object.assign({}, query, defQuery));

        route = this[baseURL] + route;
        setTimeout(()=>{
            History.replaceState(undefined, document.title, route);
        }, 0);
    }

    refresh(){
        var State = History.getState();
        this.replaceRoute(State.hash.replace(this[baseURL], ""));
    }

    goToPage (pageName, params, queryParams = {}){
        this[getPagePath](pageName, params, (pagePath)=>{
            this.goToRoute(pagePath, queryParams);
        });
    }

    replacePage (pageName, params, queryParams = {}){
        this[getPagePath](pageName, params, (pagePath)=>{
            this.replaceRoute(pagePath, queryParams);
        });
    }
    
    get route() {
        return this[activeRoute];
    }

    get page(){
        return this[activePage];
    }
    
    get params() {
        return this[activeParams];
    }
    
    get routeDefaults() {
        return Object.assign({}, this[routes][this.route]);
    }
}