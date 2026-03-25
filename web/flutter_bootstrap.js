{{flutter_js}}
{{flutter_build_config}}

_flutter.loader.load({
  serviceWorkerSettings: {
    serviceWorkerVersion: {{flutter_service_worker_version}},
  },
  onEntrypointLoaded: async function (engineInitializer) {
    const host = document.querySelector('#flutter-host');
    const appRunner = await engineInitializer.initializeEngine({
      hostElement: host,
    });
    await appRunner.runApp();
  },
});
