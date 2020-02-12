/**
 * 经观察发现
 * 注册事件发生在client.connect之后
 * 执行connect并未发生回调事件
 * 而是返回监听事件内部执行 ws数据结构相关的方法
 * 尤其是ws.onopen()
 * 之后才会返回connect成功回调方法内部执行回调方法
 * 
 * 由此进行如下尝试：
 * 1. 导出client和 ws 并在connect后执行ws.onopen 查看效果 
 *    结果：回调成功/////////但是心跳无法维持
 * 2. client 中有 ws 以及 connected 状态 考虑更改 做成v2
 *    结果：无用之功
 *    后续： 还是要进行再次整理 做成v2
 *    尝试export client
 * 2.1 进行如下尝试：
 *    主要解决ws对象中send()来源问题，步骤如下
 *    去掉ws对象中的send() 将其置空，然后让其经过over()和connect 之后打印ws对象看看效果
 *    结论  send() 必不可少
 *    
 *    #########################
 *    第一步改造，将队列 连接状态，重连信息 放入ws对象 成功
 *    第二步改造，如何做到将client对象与ws对象覆盖 即只用client做后面的api
 *               理论上，client对象是ws对象的升级，如何将ws只用作client初始化的原材料
 *               进行如下尝试
 *    其实第二步改造还有待商榷，也没有覆盖这个必要。client初始化之后就可以进行工作了，订阅或者发送或者断开连接
 *    都没有直接用到ws对象中的send方法，所以在方案的最后只需要将初始化后的client对象导出即可
 * 
 */
import {
  Stomp
} from './stomp.js'
class SocketApi {
  constructor(url) {

    this.stompClient = null
    this.ws = {
      send: (msg) => {
        // 如果socket已连接则发送消息
        if (this.ws.socketConnected) {
          wx.sendSocketMessage({
            data: msg
          })
        } else {
          // socket没有连接将消息放入队列中
          this.ws.messageQueue.push(msg)
        }
      },
      close: () => {
        if (this.ws.socketConnected) {
          wx.closeSocket()
        }
      },
      connect: () => {
        wx.connectSocket({
          url: url
        })
      },
      socketConnected: false,
      messageQueue: [],
      reconnect: false
    }
  }

  initSocket(ws = this.ws) {
    console.log("执行init");
    /**
     * 定期发送心跳或检测服务器心跳
     */
    Stomp.setInterval = function (interval, f) {
      return setInterval(f, interval);
    }
    // 结束定时器的循环调用
    Stomp.clearInterval = function (id) {
      return clearInterval(id);
    }

    var stompClient = Stomp.over(ws);

    stompClient.connect({}, function succes(callback) {
      console.log("回调成功" + callback);
    }, function error(error) {
      console.log(error)
    })
    this.stompClient = stompClient

    this.setListener()

    console.log(this.stompClient)
  }

  setListener(ws = this.stompClient.ws) {
    console.log(ws);

    ws.connect()
    // 监听 WebSocket 连接打开事件
    wx.onSocketOpen(function (res) {
      console.log("WebSocket 连接成功")
      ws.socketConnected = true
      // 关键的一步
      ws.onopen()

      // 连接成功后，将队列中的消息发送出去
      let queueLength = ws.messageQueue.length
      for (let i = 0; i < queueLength; i++) {
        const messageQueueElement = ws.messageQueue.shift();
        wx.sendSocketMessage({
          data: messageQueueElement
        })
      }
    })

    // 监听 WebSocket 接受到服务器的消息事件
    wx.onSocketMessage(function (res) {
      // console.log(res)
      ws.onmessage(res)

    })

    // 监听 WebSocket 错误事件
    wx.onSocketError(function (res) {
      console.log("WebSocket 错误事件")
      // ws.onerror()
    })

    // 监听 WebSocket 连接关闭事件
    wx.onSocketClose(function (res) {
      console.log("WebSocket 连接关闭")
      ws.socketConnected = false
      // ws.onclose()
      // 断线重连
      if (ws.reconnect) {
        ws.connect()
      }
    })
  }
}
const socket = new SocketApi('wss://www.dutbit.com/demo/chat')
socket.initSocket()
const Client = socket.stompClient
export default Client