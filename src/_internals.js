export const getPath = Symbol("fluxtuateRouter_getPath");
export const setRouteProperties = Symbol("fluxtuateRouter_setRouteProperties");
export const createPart = Symbol("fluxtuateRouter_createPart");
export const routeContext = Symbol("fluxtuateRouter_routeContext");

//match any property
export const propsRegex = /{([^}]*)}|:([^:]*):/gi;