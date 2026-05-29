self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { title: "Strikebot Live", body: event.data ? event.data.text() : "New event" };
  }

  const title = payload.title || "Strikebot Live";
  const options = {
    body: payload.body || "New Strikebot event",
    tag: payload.tag || "strikebot-live",
    icon: "/matotam-logo.png",
    badge: "/matotam-logo.png",
    data: {
      url: payload.url || "/strikebot",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : "/strikebot";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("/strikebot") && "focus" in client) {
          client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
