declare module "localtunnel" {
  interface Tunnel {
    url: string;
    close(): void;
    on(event: "error", handler: (err: Error) => void): this;
    on(event: "close", handler: () => void): this;
  }

  interface Options {
    port: number;
    subdomain?: string;
    host?: string;
  }

  function localtunnel(options: Options): Promise<Tunnel>;
  export default localtunnel;
}
