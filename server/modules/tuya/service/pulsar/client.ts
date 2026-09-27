import Event from "events";
import WebSocket from "ws";

import {
  getTuyaEnvConfig,
  TUYA_PASULAR_ENV,
  TuyaRegionConfigEnum,
} from "./config";
import { buildPassword, buildQuery, decrypt, getTopicUrl } from "./utils";

type LoggerLevel = "INFO" | "ERROR";

interface IConfig {
  accessId: string;
  accessKey: string;
  env: TUYA_PASULAR_ENV;
  url: TuyaRegionConfigEnum;

  timeout?: number;
  maxRetryTimes?: number;
  retryTimeout?: number;
  logger?: (level: LoggerLevel, ...args: unknown[]) => void;
}

class TuyaMessageSubscribeWebsocket {
  static URL = TuyaRegionConfigEnum;
  static env = TUYA_PASULAR_ENV;

  static data = "TUTA_DATA";
  static error = "TUYA_ERROR";
  static open = "TUYA_OPEN";
  static close = "TUYA_CLOSE";
  static reconnect = "TUYA_RECONNECT";
  static ping = "TUYA_PING";
  static pong = "TUYA_PONG";

  private config: IConfig;
  private server?: WebSocket;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryTimes: number;
  private event: Event;

  constructor(config: IConfig) {
    this.config = Object.assign(
      {
        ackTimeoutMillis: 3000,
        subscriptionType: "Failover",
        retryTimeout: 1000,
        maxRetryTimes: 100,
        timeout: 30000,
        logger: console.log,
      },
      config,
    );
    this.event = new Event();
    this.retryTimes = 0;
  }

  public start() {
    this.server = this._connect();
  }

  public open(cb: (ws: WebSocket) => void) {
    this.event.on(TuyaMessageSubscribeWebsocket.open, cb);
  }

  public message(cb: (ws: WebSocket, message: unknown) => void) {
    this.event.on(TuyaMessageSubscribeWebsocket.data, cb);
  }

  public ping(cb: (ws: WebSocket) => void) {
    this.event.on(TuyaMessageSubscribeWebsocket.ping, cb);
  }

  public pong(cb: (ws: WebSocket) => void) {
    this.event.on(TuyaMessageSubscribeWebsocket.pong, cb);
  }

  public reconnect(cb: (ws: WebSocket) => void) {
    this.event.on(TuyaMessageSubscribeWebsocket.reconnect, cb);
  }

  public ackMessage(messageId: string) {
    if (this.server) this.server.send(JSON.stringify({ messageId }));
  }

  public error(cb: (ws: WebSocket, error: unknown) => void) {
    this.event.on(TuyaMessageSubscribeWebsocket.error, cb);
  }

  public close(cb: (ws: WebSocket) => void) {
    this.event.on(TuyaMessageSubscribeWebsocket.close, cb);
  }

  private _reconnect() {
    if (
      this.config.maxRetryTimes &&
      this.retryTimes < this.config.maxRetryTimes
    ) {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        this.retryTimes++;
        this._connect(false);
      }, this.config.retryTimeout);
    }
  }

  private _connect(isInit = true) {
    const { accessId, accessKey, env, url } = this.config;
    const topicUrl = getTopicUrl(
      url,
      accessId,
      getTuyaEnvConfig(env).value,
      `?${buildQuery({ subscriptionType: "Failover", ackTimeoutMillis: 30000 })}`,
    );
    const password = buildPassword(accessId, accessKey);
    this.server = new WebSocket(topicUrl, {
      rejectUnauthorized: false,
      headers: { username: accessId, password },
    });
    this.subOpen(this.server, isInit);
    this.subMessage(this.server);
    this.subPing(this.server);
    this.subPong(this.server);
    this.subError(this.server);
    this.subClose(this.server);
    return this.server;
  }

  private subOpen(server: WebSocket, isInit = true) {
    server.on("open", () => {
      if (server.readyState === server.OPEN) {
        this.retryTimes = 0;
      }
      this.keepAlive(server);
      this.event.emit(
        isInit
          ? TuyaMessageSubscribeWebsocket.open
          : TuyaMessageSubscribeWebsocket.reconnect,
        this.server,
      );
    });
  }

  private subPing(server: WebSocket) {
    server.on("ping", () => {
      this.event.emit(TuyaMessageSubscribeWebsocket.ping, this.server);
      this.keepAlive(server);
      server.pong(this.config.accessId);
    });
  }

  private subPong(server: WebSocket) {
    server.on("pong", () => {
      this.keepAlive(server);
      this.event.emit(TuyaMessageSubscribeWebsocket.pong, this.server);
    });
  }

  private subMessage(server: WebSocket) {
    server.on("message", (data: WebSocket.RawData) => {
      try {
        this.keepAlive(server);
        const start = Date.now();
        this.logger("INFO", `receive msg, jsonMessage=${data}`);
        const obj = this.handleMessage(data.toString());
        this.logger("INFO", "the real message data:", obj);
        this.event.emit(TuyaMessageSubscribeWebsocket.data, this.server, obj);
        const end = Date.now();
        this.logger("INFO", `business processing cost=${end - start}`);
      } catch (e) {
        this.logger("ERROR", e);
        this.event.emit(TuyaMessageSubscribeWebsocket.error, e);
      }
    });
  }

  private subClose(server: WebSocket) {
    server.on("close", (...data) => {
      this._reconnect();
      this.clearKeepAlive();
      this.event.emit(TuyaMessageSubscribeWebsocket.close, ...data);
    });
  }

  private subError(server: WebSocket) {
    server.on("error", (e) => {
      this.event.emit(TuyaMessageSubscribeWebsocket.error, this.server, e);
    });
  }

  private clearKeepAlive() {
    clearTimeout(this.timer);
  }

  private keepAlive(server: WebSocket) {
    this.clearKeepAlive();
    this.timer = setTimeout(() => {
      server.ping(this.config.accessId);
    }, this.config.timeout);
  }

  private handleMessage(data: string) {
    const { payload, properties, ...others } = JSON.parse(data);
    const encryptyModel = properties.em;
    const pStr = Buffer.from(payload, "base64").toString("utf-8");
    const pJson = JSON.parse(pStr);
    pJson.data = decrypt(pJson.data, this.config.accessKey, encryptyModel);
    return { payload: pJson, ...others };
  }

  private logger(level: LoggerLevel, ...info: unknown[]) {
    const realInfo = `${Date.now()} `;
    if (this.config.logger) {
      this.config.logger(level, realInfo, ...info);
    }
  }
}

export default TuyaMessageSubscribeWebsocket;
