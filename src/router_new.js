import {autobind} from "core-decorators"
import EventDispatcher from "fluxtuate/lib/event-dispatcher"
import {ROUTE_CHANGE, ROUTE_CHANGED} from "./route-enums"
import RouterContext from "./router-context"
import History from "./history"
import {setRouteProperties} from "./_internals"

const started = Symbol("fluxtuateRouter_started");
const activeURI = Symbol("fluxtuateRouter_activeURI");
const contexts = Symbol("fluxtuateRouter_contexts");
const baseURL = Symbol("fluxtuateRouter_base");
const transferQuery = Symbol("fluxtuateRouter_transferQuery");
const rootPart = Symbol("fluxtuateRouter_rootPart");
const routeChanged = Symbol("fluxtuateRouter_routeChanged");
const calculateURIState = Symbol("fluxtuateRouter_calculateURIState");
const rootFluxtuateContext = Symbol("fluxtuateRouter_rootFluxtuateContext");
const query = Symbol("fluxtuateRouter_query");

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
export default class Router extends EventDispatcher{
    constructor(context, routerTransferQuery = [], base = "") {
        super();
        this[started] = false;

        let rootContext = new RouterContext("root");
        this[contexts] = {root: rootContext};

        this[baseURL] = base;
        this[transferQuery] = routerTransferQuery;
        this[rootFluxtuateContext] = context;

        this[routeChanged] = () => {
            this.goToRoute(this[rootPart].toString());
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
            if(this[activeURI] !== uri)
                rootContext.parse(uri).then((part)=>{
                    if(this[rootPart]) {
                        this[rootPart][setRouteProperties](part);
                    }else{
                        this[rootPart] = part;
                        part.addListener(ROUTE_CHANGE, this[routeChanged])
                    }
                    this.dispatch(ROUTE_CHANGED, this[rootPart].currentRoute);
                });
            this[activeURI] = uri;
        };
    }

    createContext(contextName) {
        if(this[contexts].hasOwnProperty(contextName)) {
            throw new Error(`You already have created a context with the ${contextName} name, context names must be unique!`)
        }
        this[contexts][contextName] = new RouterContext(contextName);
        return this[contexts][contextName];
    }

    mapRoute(route, routeParams) {
        return this[contexts].root.mapRoute(route, routeParams);
    }

    goToRoute(route, query = {}){
        let defQuery = {};
        this[transferQuery].forEach((qN)=>{
            if(this.query[qN])
                defQuery[qN] = this.query[qN];
        });

        route = processRoute(route, Object.assign({}, query, defQuery));

        route = this[baseURL] + route;
        setTimeout(()=>{
            History.pushState(undefined, document.title, route);
        }, 0);
    }

    startRouter() {
        History.Adapter.bind(window,"statechange",this[calculateURIState]);
        History.Adapter.onDomLoad(this[calculateURIState]);
        this[started] = true;
    }

    get contexts() {
        return Object.assign({}, this[contexts]);
    }

    get location() {
        return this[rootPart];
    }
}