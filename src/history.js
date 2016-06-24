
var hasHistory = false;
if(!hasHistory)
    require("historyjs/scripts/bundled/html4+html5/native.history.js");


hasHistory = true;

module.exports = window.History;
