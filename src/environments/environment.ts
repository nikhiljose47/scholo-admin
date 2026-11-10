export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyAiKeUWjP_QW60GVzsCHqOakPd_IbncuxY',
    authDomain: 'authentication-785fd.firebaseapp.com',
    databaseURL: 'https://authentication-785fd.firebaseio.com',
    projectId: 'authentication-785fd',
    storageBucket: 'authentication-785fd.firebasestorage.app',
    messagingSenderId: '1075520564177',
    appId: '1:1075520564177:web:120808765ddd8c64a70ef0',
  },
  syllabusApiBaseUrl: 'https://content.scholo.co.in',
  /** Community Problem Library admin UI. See content-api's ALLOWED_ORIGINS for CORS setup. */
  problemLibrary: { enabled: true, apiBase: 'https://content-api.nikhiljose47.workers.dev' },
  /** Same content-api Worker as problemLibrary.apiBase; used for the /thumbnail upload route too. */
  contentApiBaseUrl: 'https://content-api.nikhiljose47.workers.dev',
};
