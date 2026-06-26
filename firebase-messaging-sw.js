importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// 非同期で設定ファイルを読み込んでFirebaseを初期化
fetch('firebase-config.json')
  .then(response => response.json())
  .then(config => {
    firebase.initializeApp(config);
    const messaging = firebase.messaging();

    // バックグラウンドでの通知受信時の処理
    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Received background message ', payload);
      const notificationTitle = payload.notification?.title || '接客呼び出し';
      const notificationOptions = {
        body: payload.notification?.body || '呼び出しが発生しました。スマホ画面を確認してください。',
        icon: './icon.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: 'call-notification',
        renotify: true,
        data: payload.data
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  })
  .catch(err => {
    console.error('[firebase-messaging-sw.js] Failed to load config or initialize:', err);
  });
