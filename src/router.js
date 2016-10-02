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
const locationCallbacks = Symbol("fluxtuateRouter_locationCallbacks");
const routeChanged = Symbol("fluxtuateRouter_routeChanged");
const calculateURIState = Symbol("fluxtuateRouter_calculateURIState");
const rootFluxtuateContext = Symbol("fluxtuateRouter_rootFluxtuateContext");
const query = Symbol("fluxtuateRouter_query");

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
    constructor(context, routerTransferQuery = [], base = "") {
        super();
        this[started] = false;
        this[locationCallbacks] = [];

        let rootContext = new RouterContext("root", this);
        this[contexts] = {root: rootContext};

        this[rootPart] = rootContext.generatePart();

        this[routeChanged] = () => {
            this.goToRoute(this[rootPart].toString());
        };

        this[rootPart].addListener(ROUTE_CHANGE, this[routeChanged]);

        while(this[locationCallbacks].length > 0) {
            this[locationCallbacks].pop()(this[rootPart]);
        }

        this[baseURL] = base;
        this[transferQuery] = routerTransferQuery;
        this[rootFluxtuateContext] = context;

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
                    this[rootPart][setRouteProperties](part);

                    this[rootPart].start().then(()=>{
                        this.dispatch(ROUTE_CHANGED, this[rootPart].currentRoute);
                    });
                });
            this[activeURI] = uri;
        };
    }

    createContext(contextName) {
        if(this[contexts].hasOwnProperty(contextName)) {
            throw new Error(`You already have created a context with the ${contextName} name, context names must be unique!`)
        }
        this[contexts][contextName] = new RouterContext(contextName, this);
        return this[contexts][contextName];
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

        route = processQuery(route, Object.assign({}, query, defQuery));

        route = this[baseURL] + route;

        History.pushState(undefined, document.title, route);
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