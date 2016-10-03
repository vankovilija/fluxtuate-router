import {inject} from "fluxtuate"

export default function (location) {
    return class Config  {
        @inject
        injector;

        configure() {
            if(!this.injector.hasInjection("location"))
                this.injector.mapKey("location").toValue(location);
        }
    }
}