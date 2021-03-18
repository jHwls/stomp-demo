import { Client } from "@stomp/stompjs";
import React from "react";

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

const initialState = { messages: [], subscriptions: [] };

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
      if (action.data[0] === "Q") {
        const messages = checkDuplicates([
          prepare(action.data),
          ...state.messages
        ]);

        return {
          ...state,
          messages
        };
      } else {
        return state;
      }
    }
    case "SUBSCRIBE": {
      return {
        ...state,
        subscriptions: {
          ...state.subscriptions,
          [action.ticker]: action.subscription
        }
      };
    }
    case "UNSUBSCRIBE":
      if (!state.subscriptions[action.ticker]?.unsubscribe) return state;

      state.subscriptions[action.ticker].unsubscribe();

      const {
        [action.ticker]: v,
        ...remainingSubscriptions
      } = state.subscriptions;

      return {
        ...state,
        subscriptions: remainingSubscriptions
      };
    case "CLEAR":
      return {
        ...state,
        messages: []
      };
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

  const [{ messages, subscriptions }, dispatch] = React.useReducer(
    reducer,
    initialState
  );

  const messageCallback = (message) => {
    const obj = JSON.parse(message.body);

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
      ["SPY", "QQQ", "IWM"].forEach((t) => {
        const subscription = ws.subscribe("/topic/iex/" + t, messageCallback);

        dispatch({
          messageType: "SUBSCRIBE",
          subscription: subscription,
          ticker: t
        });
      });
      // setTimeout(() => ws.deactivate(), 60_000);
    };

    ws.onDisconnect = function () {
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

  React.useEffect(() => {}, []);

  function activate() {
    if (!ws) return;

    ws.activate();
  }

  function subscribe(tickerList) {
    if (!ws) return;

    tickerList.forEach((t) => {
      if (subscriptions[t]) return;

      const subscription = ws.subscribe("/topic/iex/" + t, messageCallback);

      dispatch({
        messageType: "SUBSCRIBE",
        subscription: subscription,
        ticker: t
      });
    });
  }

  function deactivate() {
    if (!ws) return;

    ws.deactivate();
  }

  function clear() {
    dispatch({ messageType: "CLEAR" });
  }

  function handleSubscribe(e) {
    e.preventDefault();

    const data = new FormData(e.target);

    const tickerList = data
      .get("tickers")
      .split(/[^\w]/)
      .filter((s) => s != "");

    subscribe(tickerList);
  }

  function handleUnsubscribe(t) {
    if (!t) return;

    dispatch({ messageType: "UNSUBSCRIBE", ticker: t });
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
        <button onClick={activate}>Connect</button>
        <button onClick={deactivate}>Disconnect</button>
        <button onClick={clear}>Clear</button>
        <form onSubmit={handleSubscribe}>
          <input type="text" name="tickers"></input>
          <button type="submit">Subscribe</button>
        </form>
        {Object.keys(subscriptions).map((t) => (
          <button type="button" onClick={() => handleUnsubscribe(t)}>
            Unsubscribe {t}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Index;
