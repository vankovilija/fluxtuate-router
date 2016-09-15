import EventDispatcher from "fluxtuate/lib/event-dispatcher"
import {setRouteProperties, propsRegex} from "./_internals"
import {ROUTE_CHANGE} from "./route-enums"
import {destroy} from "fluxtuate/lib/event-dispatcher/_internals"

const currentRoute = Symbol("fluxtuateRouter_currentRoute");
const contextRoute = Symbol("fluxtuateRouter_contextRoute");
const contextsRoute = Symbol("fluxtuateRouter_contextsRoute");
const requesthUpdate = Symbol("fluxtuateRouter_requestUpdate");
const partListeners = Symbol("fluxtuateRouter_partListeners");

export default class RoutePart extends EventDispatcher {
    constructor (routeProperties = {}, contexts = [], context = {}) {
        super();
        this[partListeners] = [];
        this[contextRoute] = context;
        this[setRouteProperties] = (routeProperties, contexts) => {
            if(routeProperties[currentRoute]){
                contexts = routeProperties[contextsRoute];
                routeProperties = routeProperties[currentRoute];
            }
            while(this[partListeners].length > 0) {
                this[partListeners].pop().remove();
            }
            if(this[currentRoute]){
                this[contextsRoute].forEach((contextProp)=>{
                    this[currentRoute].params[contextProp][destroy]();
                })
            }
            this[currentRoute] = routeProperties;
            this[contextsRoute] = contexts;
            contexts.forEach((contextProp)=>{
                this[partListeners].push(routeProperties.params[contextProp].addEventListener(ROUTE_CHANGE, this[requesthUpdate]));
            });



            // config on route:
            // let newConfig = [].concat(this[configToPath][path], this[configToPage][pageName]);
            //
            // newConfig.filter((con)=>con && !con.config).forEach((con) =>{
            //     if(con.event){
            //         this[rootContext].dispatch(con.event, routeProperties);
            //     }
            // });
            //
            // newConfig = newConfig.filter((con) => con && con.config?true:false);
            //
            // let addingDifference = differenceBy(newConfig, this[routeConfig], (con)=>con.config);
            // let excludingDifference = differenceBy(this[routeConfig], newConfig, (con)=>con.config);
            //
            // let leftConfig = this[routeConfig].filter((con)=>excludingDifference.indexOf(con) === -1);
            //
            // let routeChangePromises = [new Promise((resolve)=>resolve())];
            //
            // for(let i = 0; i < leftConfig.length; i++) {
            //     let index = findIndex(newConfig, {config: leftConfig[i].config});
            //     let rIndex = this[routeConfig].indexOf(leftConfig[i]);
            //     this[routeConfig].splice(rIndex, 1, newConfig[index]);
            //     if(newConfig[index].event) {
            //         let context = this[routeContext][rIndex];
            //
            //         context.dispatch(newConfig[index].event, routeProperties);
            //
            //         routeChangePromises.push(new Promise((resolve)=>{
            //             setTimeout(function(event){
            //                 if(context.commandMap.hasEvent(event)) {
            //                     context.commandMap.onComplete(resolve);
            //                 }else{
            //                     resolve();
            //                 }
            //             }.bind(this, newConfig[index].event), 0);
            //         }));
            //     }
            // }
            //
            // if(addingDifference.length > 0 || excludingDifference.length > 0){
            //     excludingDifference.forEach((config)=>{
            //         let i = this[routeConfig].indexOf(config);
            //         let context = this[routeContext][i];
            //
            //         let fullContextChildren = context.children.slice();
            //         fullContextChildren.forEach(c=> {
            //             context.removeChild(c);
            //             context.parent.addChild(c);
            //         });
            //
            //         context.destroy();
            //
            //         this[routeContext].splice(i, 1);
            //         this[routeConfig].splice(i, 1);
            //     });
            //
            //     addingDifference.forEach((configObject)=>{
            //         let newContext = new Context();
            //         newContext.config(configObject.config);
            //         if(configObject.event){
            //             setTimeout(()=>{
            //                 newContext.dispatch(configObject.event, routeProperties);
            //             }, 0);
            //             routeChangePromises.push(new Promise((resolve)=>{
            //                 setTimeout(function(event){
            //                     if(newContext.commandMap.hasEvent(event)) {
            //                         newContext.commandMap.onComplete(resolve);
            //                     }else{
            //                         resolve();
            //                     }
            //                 }.bind(this, configObject.event), 0);
            //             }));
            //         }
            //         let parent = this.routeLastContext;
            //         this[routeConfig].push(configObject);
            //         this[routeContext].push(newContext);
            //         if(parent){
            //             parent.children.forEach(c=>{
            //                 parent.removeChild(c);
            //                 newContext.addChild(c);
            //             });
            //             parent.addChild(newContext);
            //         }
            //     });
            //     this.dispatch("route_context_updated", Object.assign({
            //         startingContext: this.routeFirstContext,
            //         endingContext: this.routeLastContext
            //     }, routeProperties));
            // }
            //
            // Promise.all(routeChangePromises).then(()=>{
            //     this.dispatch("route_changed", routeProperties);
            // });
            //
            // this[activeRoute] = route;
            // this[activePage] = pageName;
            // this[activeParams] = params;
        };

        this[requesthUpdate] = () => {
            this.dispatch(ROUTE_CHANGE, this);
        };

        this[setRouteProperties](routeProperties, contexts);
    }

    goToPage (pageName, params) {
        this.goToRoute(this[contextRoute].resolvePage(pageName, params));
    }

    goToPath (pagePath, params) {
        this.goToRoute(this[contextRoute].resolvePath(pagePath, params));
    }

    goToRoute (route) {
        this[setRouteProperties](route[currentRoute], route[contextsRoute]);
        this[requesthUpdate]();
    }

    get currentRoute() {
        return Object.assign({}, this[currentRoute]);
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