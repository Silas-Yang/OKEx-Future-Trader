import * as WebSocket from 'ws'
import * as Rx from 'rxjs'
import * as events from 'events'

// declare class ObservableSocket {
//     constructor(ws: WebSocket)
//     down: Rx.Observable<WebSocket.Data>
//     up: (data: string) => Promise<any>
// }

export declare interface ObservableSocketRet {
    // down: Rx.Observable<WebSocket.Data>,
    down: Rx.Observable<MessageEvent>,
    up: (data: string) => Promise<any>
}

export declare function ObservableSocket(ws: WebSocket): ObservableSocketRet