from websocket_server import WebsocketServer
import json
import threading
def ask():
    global server
    while True:
        id = input("What is the circle ID?\n")
        key = input("What is the key?\n")
        payload = json.dumps({"type": "join_circle",
                              "payload":
                                  {"id": id, "key": key}})
        server.send_message_to_all(payload)
server = WebsocketServer(19884, host='0.0.0.0')
t = threading.Thread(target=ask)
t.daemon = True
t.start()
server.run_forever()
