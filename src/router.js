import {autobind} from "core-decorators"
import EventDispatcher from "fluxtuate/lib/event-dispatcher"
import {ROUTE_CHANGE, ROUTE_CHANGED, ROUTE_REPLACE, ROUTE_NOT_FOUND} from "./route-enums"
import RouterConfiguration from "./router-configuration"
import History from "./history"
import {setRouteProperties} from "./_internals"

const started = Symbol("fluxtuateRouter_started");
const activeURI = Symbol("fluxtuateRouter_activeURI");
const contexts = Symbol("fluxtuateRouter_contexts");
const baseURL = Symbol("fluxtuateRouter_base");
const transferQuery = Symbol("fluxtuateRouter_transferQuery");
const rootPart = Symbol("fluxtuateRouter_rootPart");
const locationCallbacks = Symbol("fluxtuateRouter_locationCallbacks");
const routeChanged = Symbol("fluxtuateRouter_routeChanged");
const routeReplaced = Symbol("fluxtuateRouter_routeReplaced");
const routeNotFound = Symbol("fluxtuateRouter_routeNotFound");
const loadRouter = Symbol("fluxtuateRouter_loadRouter");
const calculateURIState = Symbol("fluxtuateRouter_calculateURIState");
const rootFluxtuateContext = Symbol("fluxtuateRouter_rootFluxtuateContext");
const query = Symbol("fluxtuateRouter_query");
const useHistory = Symbol("fluxtuateRouter_useHistory");
const goToURI = Symbol("fluxtuateRouter_goToURI");

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

function processQuery(route, queryParams = {}) {
    let r = route;
    let count = 0;
    for (let key in queryParams) {

        if(count > 0) {
            r += "&";
        }else{
            r += "?";
        }

        r += `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`;

        count ++;
    }

    return r;
}

@autobind
export default class Router extends EventDispatcher{
    constructor(context, routerTransferQuery = [], base = "", shouldUseHistory = true) {
        super();
        this[useHistory] = shouldUseHistory;
        this[started] = false;
        this[locationCallbacks] = [];

        let rootContext = new RouterConfiguration("root", this);
        this[contexts] = {root: rootContext};

        this[rootPart] = rootContext.generatePart();

        this[routeChanged] = () => {
            this.goToRoute(this[rootPart].toString());
        };

        this[routeReplaced] = () => {
            this.replaceRoute(this[rootPart].toString());
        };

        this[routeNotFound] = () => {
            let notFoundPart = rootContext.generatePart();
            this.replaceRoute(notFoundPart.toString());

        };

        this[rootPart].addListener(ROUTE_CHANGE, this[routeChanged]);
        this[rootPart].addListener(ROUTE_REPLACE, this[routeReplaced]);
        this[rootPart].addListener(ROUTE_NOT_FOUND, this[routeNotFound]);

        while(this[locationCallbacks].length > 0) {
            this[locationCallbacks].pop()(this[rootPart]);
        }

        this[baseURL] = base;
        this[transferQuery] = routerTransferQuery;
        this[rootFluxtuateContext] = context;

        this[loadRouter] = () => {
            this[calculateURIState]();
            this[loadRouter] = ()=>{};
        };

        this[calculateURIState] = () => {
            var State = History.getState();
            this[goToURI](State.hash);
        };

        this[goToURI] = (url) => {
            var uriArray = url.split("?");
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
            if(this[activeURI] !== uri)
                rootContext.parse(uri).then((part)=>{
                    if(part.isNotFound) {
                        this[routeNotFound]();
                    }
                    this[rootPart][setRouteProperties](part);

                    this[rootPart].start().then(()=>{
                        this.dispatch(ROUTE_CHANGED, this[rootPart].currentRoute);
                    });
                }).caught(()=>{
                    this[routeNotFound]();
                });
            this[activeURI] = uri;
        }
    }

    createConfiguration(configurationName) {
        if(this[contexts].hasOwnProperty(configurationName)) {
            throw new Error(`You already have created a configuration with the name of ${configurationName}, route configuration names must be unique!`)
        }
        this[contexts][configurationName] = new RouterConfiguration(configurationName, this);
        return this[contexts][configurationName];
    }

    mapRoute(route, routeParams) {
        return this[contexts].root.mapRoute(route, routeParams);
    }

    mapConfig(Config) {
        return this[contexts].root.mapConfig(Config);
    }

    goToRoute(route, query = {}){
        let defQuery = {};
        this[transferQuery].forEach((qN)=>{
            if(this.query[qN])
                defQuery[qN] = this.query[qN];
        });

        route = processQuery(processRoute(route), Object.assign({}, query, defQuery));

        route = this[baseURL] + route;

        if(this[useHistory]) {
            History.pushState(undefined, document.title, route);
        }else{
            this[goToURI](route);
        }
    }

    replaceRoute(route, query = {}){
        let defQuery = {};
        this[transferQuery].forEach((qN)=>{
            if(this.query[qN])
                defQuery[qN] = this.query[qN];
        });

        route = processQuery(processRoute(route), Object.assign({}, query, defQuery));

        route = this[baseURL] + route;

        if(this[useHistory]) {
            History.replaceState(undefined, document.title, route);
        }else{
            this[goToURI](route);
        }
    }

    get query() {
        return Object.assign({}, this[query]);
    }

    startRouter() {
        History.Adapter.onDomLoad(this[loadRouter]);
        if(this[useHistory])
            History.Adapter.bind(window, "statechange", this[calculateURIState]);

        this[started] = true;
    }

    get contexts() {
        return Object.assign({}, this[contexts]);
    }

    get location() {
        return this[rootPart];
    }

    get started() {
        return this[started];
    }
}