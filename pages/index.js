import { Client } from "@stomp/stompjs";

const config = {
  debug: function (str) {
    // console.log(str);
  },
  reconnectDelay: 5_000,
  heartbeatIncoming: 10_000,
  heartbeatOutgoing: 10_000,
  discardWebsocketOnCommFailure: true,
  brokerURL: process.env.NEXT_PUBLIC_STOMP_SERVER + process.env.NEXT_PUBLIC_JWT
};

const initialState = { messages: [] };

function reducer(state, action) {
  switch (action.messageType) {
    case "L": {
      const messages = checkDuplicates([
        ...action.data.map(prepare),
        ...state.messages
      ]);

      return {
        ...state,
        messages
      };
    }
    case "A": {
      const messages = checkDuplicates([
        prepare(action.data),
        ...state.messages
      ]);

      return {
        ...state,
        messages
      };
    }
    case "CLEAR":
      return initialState;
    default:
      return state;
  }
}

function prepare(message) {
  return {
    duplicate: false,
    data: JSON.stringify(message).replace(/,/g, ", ")
  };
}

function checkDuplicates(messages) {
  const allMessageData = messages.map((m) => m.data);
  const set = [...new Set(allMessageData)];

  // console.log(
  //   "DUPLICATES?",
  //   set.length !== messages.length,
  //   set.length,
  //   messages.length
  // );

  let duplicates = [...allMessageData];
  set.forEach((item) => {
    const i = duplicates.indexOf(item);
    duplicates = duplicates
      .slice(0, i)
      .concat(duplicates.slice(i + 1, duplicates.length));
  });

  return messages.map((message) => {
    const i = duplicates.indexOf(message.data);

    return {
      ...message,
      duplicate: i !== -1
    };
  });
}

const Index = () => {
  const [status, setStatus] = React.useState("DISCONNECTED");
  const [ws, setWs] = React.useState(null);
  const [subId, setSubId] = React.useState(null);
  const [tickers, setTickers] = React.useState(["SPLK", "CSCO"]);

  const [{ messages }, dispatch] = React.useReducer(reducer, initialState);

  const messageCallback = (message) => {
    const obj = JSON.parse(message.body);
    // console.log("RECEIVING MSG", obj);
    if (obj.data?.subscriptionId) {
      setSubId(obj.data.subscriptionId);
    }

    dispatch(obj);
  };

  React.useEffect(() => {
    if (ws) return;
    const ws = new Client(config);

    ws.beforeConnect = function () {
      setStatus("INITIALIZING");
    };

    ws.onConnect = function (frame) {
      setStatus("CONNECTED");

      ws.subscribe("/user/topic/iex", messageCallback);

      ws.publish({
        destination: "/app/iex",
        body: JSON.stringify({ action: "load", symbols: tickers })
      });
    };

    ws.onDisconnect = function () {
      setSubId(null);
      setStatus("DISCONNECTED");
    };

    ws.onStompError = function (error) {
      console.error("Error setting up vitals bar", error);
      try {
        if (ws) {
          ws.deactivate();
        }
      } catch (e) {
        console.error("Error closing WebSocket:", e);
      } finally {
        setTimeout(reconnect, 3000);
      }
    };

    setWs(ws);

    return () => {
      if (ws) {
        ws.deactivate();
      }
    };
  }, []);

  function activate() {
    if (!ws) return;

    ws.activate();
  }

  function deactivate() {
    if (!ws) return;

    ws.deactivate();
  }

  function clear() {
    dispatch({ messageType: "CLEAR" });
  }

  function subscribe(e) {
    e.preventDefault();

    console.log(e);

    if (!ws) return;

    ws.publish({
      destination: "/app/iex",
      body: JSON.stringify({
        action: "subscribe",
        symbols: [e.target.event],
        subscriptionId: subId
      })
    });
  }

  return (
    <div style={{ display: "flex", gap: "2rem", maxWidth: 900 }}>
      <ul style={{ flexBasis: "50%" }}>
        {messages.map((m) => (
          <li>
            <pre
              style={{
                background: m.duplicate ? "salmon" : "lightgrey",
                whiteSpace: "pre-wrap"
              }}
            >
              <code>{m.data}</code>
            </pre>
          </li>
        ))}
      </ul>
      <div style={{ flexBasis: "50%" }}>
        <h1>Status: {status}</h1>
        <h2>
          {subId
            ? `Subscribed as #${subId} to: ${tickers.join(", ")}`
            : "Connect to subscribe"}
        </h2>
        <button onClick={activate}>Connect</button>
        <button onClick={deactivate}>Disconnect</button>
        <button onClick={clear}>Clear</button>
        <form onSubmit={subscribe}>
          <input type="text"></input>
          <button type="submit">Subscribe</button>
        </form>
        {}
      </div>
    </div>
  );
};

export default Index;
