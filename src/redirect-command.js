import {Command, inject} from "fluxtuate"

export default class RedirectCommand extends Command {
    @inject
    payload;

    @inject
    router;

    execute() {
        this.router.goToPage(this.payload.name, this.payload.params, this.payload.query);
    }
}