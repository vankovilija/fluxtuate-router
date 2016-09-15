export const getPath = Symbol("fluxtuateRouter_getPath");
export const setRouteProperties = Symbol("fluxtuateRouter_setRouteProperties");
export const createPart = Symbol("fluxtuateRouter_createPart");

//match any property
export const propsRegex = /{([^}]*)}|:([^:]*):/gi;