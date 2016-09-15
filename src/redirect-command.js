import {Command, inject} from "fluxtuate"

export default class RedirectCommand extends Command {
    @inject
    payload;

    @inject
    location;

    execute() {
        this.location.goToPage(this.payload.name, this.payload.params, this.payload.query);
    }
}