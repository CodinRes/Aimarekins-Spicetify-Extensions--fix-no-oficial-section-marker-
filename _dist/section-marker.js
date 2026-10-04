var sectionDmarker = (() => {
  const MIN_WIDTH_THRESHOLD = 300;
  const capitalize = (str) => str[0].toUpperCase() + str.slice(1);

  // Contenedores visuales para secciones y marcadores
  const sectionsContainer = document.createElement("div");
  sectionsContainer.classList.add("section-marker-element", "section-marker-sections");

  const markersContainer = document.createElement("div");
  markersContainer.classList.add("section-marker-element", "section-marker-markers");

  let isInterfaceInjected = false;

  async function injectInterface() {
    if (isInterfaceInjected) {
      throw new Error("Interface already injected");
    }

    function updatePlaybarDimensions(width, height) {
      document.body.style.setProperty("--section-marker-playbar-width", `${width}px`);
      document.body.style.setProperty("--section-marker-playbar-height", `${height}px`);
      document.body.classList[width < MIN_WIDTH_THRESHOLD ? "add" : "remove"](
        "section-marker-playbar-below-marker-width"
      );
    }

    isInterfaceInjected = true;
    let playbarElement;

    const resizeObserver = new ResizeObserver(() => {
      if (playbarElement) {
        updatePlaybarDimensions(playbarElement.clientWidth, playbarElement.clientHeight);
      }
    });

    document.body.classList.add("section-marker-no-data");
    let currentInjectedTarget = null;

    function handleElementFound(targetPlaybar) {
      setupPlaybar(targetPlaybar);
      if (onElementRemoved) {
        new MutationObserver((mutations, observer) => {
          for (const mutation of mutations) {
            for (const removedNode of mutation.removedNodes) {
              if (removedNode === targetPlaybar) {
                observer.disconnect();
                onElementRemoved(targetPlaybar);
                return;
              }
            }
          }
        }).observe(targetPlaybar.parentNode, { childList: true });
      }
    }

    const playbarSelector = ".playback-bar [data-testid='progress-bar'], .playback-bar .progress-bar";
    const rootContainer = await new Promise((resolve, reject) => {
      const rootSelector = "#main > .Root, .Root, #main";
      const searchContext = document.body;
      const timeout = 5000;
      let timer;

      if (timeout > 0) {
        timer = setTimeout(() => {
          console.warn(
            `waitForElm has waited for ${timeout} for selector ${rootSelector} within`,
            searchContext,
            "but it has not yet been found."
          );
        }, timeout);
      }

      const existingEl = searchContext.querySelector(rootSelector);
      if (existingEl) {
        return resolve(existingEl);
      }

      const observer = new MutationObserver(() => {
        const foundEl = searchContext.querySelector(rootSelector);
        if (foundEl) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(foundEl);
        }
      });

      observer.observe(searchContext, { childList: true, subtree: true });
    });

    function setupPlaybar(element) {
      if (currentInjectedTarget !== element) {
        playbarElement = element;
        playbarElement.classList.add("section-marker-injected-playbar");

        const targetArea =
          playbarElement.querySelector(".x-progressBar-sliderArea") ||
          playbarElement.querySelector("[data-testid='progress-bar-background']") ||
          playbarElement;

        targetArea.appendChild(sectionsContainer);
        targetArea.appendChild(markersContainer);

        updatePlaybarDimensions(playbarElement.clientWidth, playbarElement.clientHeight);
        resizeObserver.disconnect();
        resizeObserver.observe(playbarElement);
      }
    }

    const onElementRemoved = null;

    const initialPlaybar = rootContainer.querySelector(playbarSelector);
    if (initialPlaybar) {
      handleElementFound(initialPlaybar);
    }

    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const addedNode of mutation.addedNodes) {
          if (addedNode instanceof HTMLElement) {
            addedNode.querySelectorAll(playbarSelector).forEach(handleElementFound);
          }
        }
      }
    }).observe(rootContainer, { childList: true, subtree: true });
  }

  function resetState() {
    document.body.classList.remove(
      "section-marker-loading-data",
      "section-marker-had-no-data",
      "section-marker-less-than-two-sections"
    );
    document.body.classList.add("section-marker-no-data");
  }

  const sectionProperties = {
    start: (audioData, idx) => audioData.sections[idx].start,
    duration: (audioData, idx) => audioData.sections[idx].duration,
    index: (audioData, idx) => idx,
  };

  const PRELOAD_COOLDOWN = 15000;

  function isTrackUri(uri) {
    const parsedUri = Spicetify.URI.from(uri);
    return parsedUri && parsedUri.type === Spicetify.URI.Type.TRACK;
  }

  let requestCounter = 0;
  let currentTrackUri = null;

  function handleTrackChange(trackUri) {
    if (trackUri === currentTrackUri) {
      return;
    }

    currentTrackUri = trackUri;
    const currentRequestId = ++requestCounter;

    if (!isTrackUri(trackUri)) {
      resetState();
      return;
    }

    document.body.classList[
      document.body.classList.contains("section-marker-no-data") ? "add" : "remove"
    ]("section-marker-had-no-data");
    document.body.classList.add("section-marker-loading-data");

    Spicetify.getAudioData(trackUri)
      .then((audioData) => {
        if (currentRequestId !== requestCounter) {
          return;
        }

        const markersRoot = document.body.querySelector(".section-marker-markers");
        const sectionsRoot = document.body.querySelector(".section-marker-sections");

        if (!markersRoot || !sectionsRoot) {
          return;
        }

        const existingMarkers = Array.from(markersRoot.querySelectorAll(".section-marker-marker"));
        const existingSections = Array.from(sectionsRoot.querySelectorAll(".section-marker-section"));

        document.body.classList[
          audioData.sections.length < 2 ? "add" : "remove"
        ]("section-marker-less-than-two-sections");

        // Crear elementos DOM faltantes si hay más secciones que antes
        for (let i = existingMarkers.length; i < audioData.sections.length; i++) {
          const marker = document.createElement("div");
          marker.classList.add("section-marker-marker");

          const section = document.createElement("div");
          section.classList.add("section-marker-section");

          [marker, section].forEach((el) => el.classList.add("section-marker-not-exists"));

          markersRoot.appendChild(marker);
          sectionsRoot.appendChild(section);

          existingMarkers.push(marker);
          existingSections.push(section);
        }

        requestAnimationFrame(() => {
          const totalDuration = audioData.track.duration.toString();
          document.body.style.setProperty("--section-marker-data-track-duration", totalDuration);
          document.body.dataset.sectionMarkerDataTrackDuration = totalDuration;

          document.body.classList.remove("section-marker-loading-data");
          if (document.body.classList.contains("section-marker-no-data")) {
            document.body.classList.remove("section-marker-no-data");
            document.body.classList.add("section-marker-had-no-data");
          }

          // Actualizar dataset y estilos de cada sección y marcador
          for (let i = 0; i < audioData.sections.length; i++) {
            [existingMarkers[i], existingSections[i]].forEach((el) => {
              el.classList.remove("section-marker-not-exists");
              for (const [propName, propGetter] of Object.entries(sectionProperties)) {
                const value = propGetter(audioData, i).toString();
                el.dataset[`sectionMarkerData${capitalize(propName)}`] = value;
                el.style.setProperty(`--section-marker-data-${propName}`, value);
              }
            });
          }

          // Ocultar elementos sobrantes
          for (let i = audioData.sections.length; i < existingMarkers.length; i++) {
            [existingMarkers[i], existingSections[i]].forEach((el) =>
              el.classList.add("section-marker-not-exists")
            );
          }
        });
      })
      .catch((err) => {
        console.warn("SECTION-MARKER: Failed to get audio data for", trackUri, err);
        if (currentRequestId === requestCounter) {
          resetState();
        }
      });
  }

  let lastPreloadedUri = null;
  let lastPreloadTime = 0;

  const initExtension = async function () {
    // Esperar a que las APIs de Spicetify estén inicializadas
    while (
      !(
        Spicetify?.Player?.data &&
        Spicetify?.URI &&
        Spicetify?.Locale &&
        Spicetify?.CosmosAsync &&
        Spicetify?.React
      )
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await injectInterface();

    Spicetify.Player.addEventListener("onprogress", () => {
      const state = Spicetify.Player.origin.getState();
      const currentUri = (state.hasContext && state.item?.uri) || null;
      handleTrackChange(currentUri);

      // Precarga de audio para la siguiente canción cuando falten menos de 10s
      const remainingTime = Spicetify.Player.getDuration() - Spicetify.Player.getProgress();
      if (remainingTime < 10000) {
        const nextUri = Spicetify.Queue.nextTracks[0]?.contextTrack?.uri;
        const canPreload =
          lastPreloadedUri !== nextUri &&
          Date.now() - lastPreloadTime >= PRELOAD_COOLDOWN &&
          isTrackUri(nextUri);

        if (canPreload) {
          lastPreloadedUri = nextUri;
          lastPreloadTime = Date.now();
          Spicetify.getAudioData(nextUri);
        }
      }
    });
  };

  (async () => {
    await initExtension();
  })();
})();

// Inyección de estilos CSS
(async () => {
  if (!document.getElementById("sectionDmarker")) {
    const styleElement = document.createElement("style");
    styleElement.id = "sectionDmarker";
    styleElement.textContent = String.raw`
      .playback-bar .progress-bar {
        --section-marker-marker-color: rgb(255 255 255 / 0.8);
        --section-marker-marker-size: 4px;
      }
      .section-marker-disabled .section-marker-element,
      .section-marker-less-than-two-sections .section-marker-element,
      .section-marker-loading-data.section-marker-had-no-data .section-marker-element,
      .section-marker-no-data .section-marker-element {
        opacity: 0;
        transition-duration: 0.1s;
      }
      .section-marker-loading-data .section-marker-element {
        opacity: 0.1;
      }
      .section-marker-no-markers .section-marker-markers,
      .section-marker-playbar-below-marker-width .section-marker-markers {
        display: none;
      }
      .section-marker-had-no-data .section-marker-marker,
      .section-marker-had-no-data .section-marker-section {
        transition: none;
      }
      .section-marker-element {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        transition-property: opacity;
        transition-duration: 0.5s;
        transition-timing-function: ease-in-out;
        direction: ltr;
        pointer-events: none;
      }
      .section-marker-marker {
        width: var(--section-marker-marker-size);
        height: var(--section-marker-playbar-height);
        position: absolute;
        top: 50%;
        left: calc(var(--section-marker-data-start) / var(--section-marker-data-track-duration) * 100%);
        transform: translate(-50%, -50%);
        background-color: var(--section-marker-marker-color);
        transition-property: left, opacity;
        transition-duration: 0.5s;
        transition-timing-function: ease-in-out;
      }
      .section-marker-marker.section-marker-not-exists {
        left: 100%;
        opacity: 0;
      }
      .section-marker-marker:first-child {
        display: none;
      }
      .section-marker-sections {
        overflow-x: hidden;
        display: flex;
        flex-direction: row;
        position: absolute;
      }
      .section-marker-section {
        width: calc(var(--section-marker-data-duration) / var(--section-marker-data-track-duration) * 100%);
        height: 100%;
        flex-shrink: 0;
        transition: width 0.5s ease-in-out;
      }
      .section-marker-section:last-child {
        width: 100%;
      }
      .section-marker-section.section-marker-not-exists {
        width: 0;
      }
      .section-marker-section:nth-child(2n) {
        -webkit-backdrop-filter: contrast(0.6) invert(0.1);
        backdrop-filter: contrast(0.6) invert(0.1);
      }
    `.trim();
    document.head.appendChild(styleElement);
  }
})();
