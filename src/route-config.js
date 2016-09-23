export default function (location) {
    return class Config  {
        @inject
        injector;

        configure() {
            this.injector.inject("location", location);
        }
    }
}