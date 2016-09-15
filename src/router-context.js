import {findIndex} from "lodash/array"
import {isString} from "lodash/lang"
import CrossRoads from "crossroads"
import {getPath, propsRegex, createPart} from "./_internals"
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
const contextRegex = /<[^>]*>/gi;

export default class RouterContext {
    constructor(contextName, containerRouter) {
        this[parser] = CrossRoads.create();
        this[parser].greedyEnabled = false;
        this[parser].normalizeFn = CrossRoads.NORM_AS_OBJECT;
        this[parser].shouldTypecast = true;
        this[router] = containerRouter;
        this[routes] = [];
        this[routeChangeResolve] = null;
        this[calculatedRoutes] = [];

        this[createPart] = ({pageName, path, routeDefaults, contexts}, params) => {
            let routeProperties = {
                page: pageName,
                path: path,
                routeDefaults: routeDefaults,
                params: Object.assign({}, params)
            };

            let allContexts = Object.keys(contexts);

            allContexts.forEach((key)=>{
                if(routeProperties.params[`context@${key}`]) {
                    delete routeProperties.params[`context@${key}`];
                    contexts[key].context.parse(params[`context@${key}`]).then((routePart)=> {
                        routeProperties.params[key] = routePart;
                    });
                }
            });

            return new RoutePart(routeProperties, allContexts, this);
        };

        this[loadRoute] = (route, resolveRoute, params) => {
            for(let key in params){
                if(params.hasOwnProperty(key)) {
                    let param = params[key];

                    if (param === undefined) {
                        delete params[key];
                    }
                }
            }

            resolveRoute(this[createPart](route, params));
        };

        this[getPath] = (route, params) => {
            let allContexts = Object.keys(route.contexts);

            let currentPath = [route.path];

            allContexts.forEach((contextName)=>{
                let contextObject = route.contexts[contextName];
                for(let i = 0; i < currentPath.length; i++) {
                    if(isString(currentPath[i])){
                        let contextSplit = currentPath[i].split(contextObject.contextProp);
                        if(contextSplit.length > 1) {
                            let route = params[contextName].route;
                            if(!route) {
                                if(params[contextName].path)
                                    route = contextObject.context[getPathRoute](params[contextName].path);
                                else
                                    route = contextObject.context[getPageRoute](params[contextName].page);

                                if(!route) {
                                    route = contextObject.context[routes][0];
                                }
                            }
                            let routePart = contextObject.context[getPath](route, params[contextName].params, params[contextName].contexts);
                            contextSplit.splice(1, 0, routePart);
                            currentPath.splice.apply(currentPath, [i, 1, ...contextSplit])
                        }
                    }
                }
            });

            let props = Object.keys(route.props);

            props.forEach((prop)=>{
                let propPath = props[prop];
                if (params.hasOwnProperty(prop) && params[prop] !== undefined && params[prop] !== null) {
                    currentPath = currentPath.replace(propPath, params[prop]);
                } else {
                    currentPath = currentPath.replace(propPath + "/", "");
                    currentPath = currentPath.replace(propPath, "");
                }
            });

            return new RoutePart(currentPath, this);
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

            let currentPath = path;
            while ((contextMatch = contextRegex.exec(path)) !== null) {
                let contextName = contextMatch[1].split(":");
                let routeString = contextMatch[0];
                let contextType = contextName[1] || contextName[0];
                contextName = contextName[0];

                let context = this[router].contexts[contextType];
                if(!context) throw new Error(`No context found with the name: ${contextType} in context ${this[name]}!`);

                let contextProp = "{context@" + contextName + "*}";
                currentPath = currentPath.replace(routeString, contextProp);
                newRoute.contexts[contextName] = {context, contextProp};
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

    mapRoute(path, routeDefaults) {
        let routeObject = this[formRoute](path);
        routeObject = Object.assign({routeDefaults}, routeObject);
        this[routes].push(routeObject);

        this[parser].addRoute(routeObject.path, this[loadRoute].bind(this, routeObject));

        return {
            toPage(pageName) {
                routeObject.pageName = pageName;
            }
        }
    }

    resolvePage(pageName, params) {
        return this[createPart](this[getPageRoute](pageName), params);
    }

    resolvePath(pagePath, params) {
        return this[createPart](this[getPathRoute](this[formRoute](pagePath).path), params);
    }

    parse(route) {
        return new Promise((resolve)=>{
            this[parser].parse(route, [resolve]);
        });
    }
}