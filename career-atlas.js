(() => {
  const stages = window.CAREER_STAGES;
  const mapElement = document.querySelector(".career-atlas__map");
  const stageElements = [...document.querySelectorAll(".career-stage")];
  const stageColors = {education: "#9a5a00", fellowship: "#6e4fa3", appointment: "#167a6e", employment: "#0d6ed1"};

  if (!mapElement || !stageElements.length || !Array.isArray(stages) || !window.maplibregl) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const stageElementById = new Map(stageElements.map((element) => {
    const stage = stages[Number(element.dataset.stageIndex)];
    return [stage.id, element];
  }));
  const stagesByCoordinate = groupStages((stage) => coordinateKey(stage.coordinates));
  const stagesByLocation = groupStages((stage) => stage.location);
  const status = {
    element: document.querySelector(".career-atlas__status"),
    marker: document.querySelector(".career-atlas__marker"),
    date: document.querySelector(".career-atlas__date"),
    role: document.querySelector(".career-atlas__role"),
    timeline: document.querySelector(".career-atlas__timeline")
  };
  addStageMarkerLabels();
  let activeStageIndex = Number(stageElements[0].dataset.stageIndex);
  let mapIsReady = false;
  const map = new maplibregl.Map({
    container: mapElement,
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [-1.7, 52.3],
    zoom: 5.4,
    attributionControl: true,
    dragRotate: false,
    pitchWithRotate: false
  });

  map.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right");
  map.scrollZoom.disable();

  map.on("load", () => {
    map.addSource("career-path", {type: "geojson", data: pathData(activeStageIndex)});
    map.addLayer({
      id: "career-path-line",
      type: "line",
      source: "career-path",
      paint: {"line-color": "#75849a", "line-width": 2, "line-opacity": 0.8}
    });
    map.addSource("career-stages", {type: "geojson", data: pointsData(activeStageIndex)});
    map.addLayer({
      id: "career-stage-rings",
      type: "circle",
      source: "career-stages",
      layout: {"circle-sort-key": ["case", ["==", ["get", "active"], true], 100, ["get", "order"]]},
      paint: {
        "circle-radius": ["case", ["==", ["get", "active"], true], 14, 9],
        "circle-color": "#ffffff",
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-width": ["case", ["==", ["get", "active"], true], 3, 2],
        "circle-opacity": 1
      }
    });
    map.addLayer({
      id: "career-stage-labels",
      type: "symbol",
      source: "career-stages",
      layout: {
        "text-field": ["get", "label"],
        "text-size": 10,
        "text-font": ["Noto Sans Regular"],
        "text-allow-overlap": true,
        "symbol-sort-key": ["case", ["==", ["get", "active"], true], 100, ["get", "order"]]
      },
      paint: {"text-color": ["get", "color"], "text-opacity": 1}
    });
    addMarkerInteractions();
    mapIsReady = true;
    setActiveStage(activeStageIndex);
  });

  function stageForFeature(feature) {
    return stageById.get(feature.properties.id);
  }

  function groupStages(keyForStage) {
    return stages.reduce((groups, stage) => {
      const key = keyForStage(stage);
      groups.set(key, [...(groups.get(key) || []), stage]);
      return groups;
    }, new Map());
  }

  function addMarkerInteractions() {
    const popup = new maplibregl.Popup({closeButton: false, closeOnClick: false, offset: 14});
    map.on("mouseenter", "career-stage-rings", (event) => {
      map.getCanvas().style.cursor = "pointer";
      const stage = stageForFeature(event.features[0]);
      popup.setLngLat(stage.coordinates).setText(`${dateRange(stage)}: ${stage.role}, ${stage.organisation}`).addTo(map);
    });
    map.on("mouseleave", "career-stage-rings", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("click", "career-stage-rings", (event) => {
      const stage = stageForFeature(event.features[0]);
      stageElementById.get(stage.id).scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center"
      });
    });
  }

  function addStageMarkerLabels() {
    stageElements.forEach((element) => {
      const stage = stages[Number(element.dataset.stageIndex)];
      const marker = document.createElement("span");
      marker.className = "career-stage__marker";
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = stage.order;
      element.querySelector("h3").prepend(marker);
    });
  }

  function pointsData(activeIndex) {
    const activeCoordinate = coordinateKey(stages[activeIndex].coordinates);
    return {
      type: "FeatureCollection",
      features: stages.flatMap((stage, index) => {
        const coordinate = coordinateKey(stage.coordinates);
        const matchingStages = stagesByCoordinate.get(coordinate);
        const isVisible = matchingStages.length === 1 ||
          (coordinate === activeCoordinate ? index === activeIndex : stage === matchingStages[matchingStages.length - 1]);
        if (!isVisible) return [];
        return [{
          type: "Feature",
          geometry: {type: "Point", coordinates: stage.coordinates},
          properties: {
            id: stage.id,
            order: stage.order,
            label: String(stage.order),
            color: stageColors[stage.type],
            active: index === activeIndex
          }
        }];
      })
    };
  }

  function coordinateKey(coordinates) {
    return coordinates.join(",");
  }

  function pathData(activeIndex) {
    return {
      type: "FeatureCollection",
      features: activeIndex < stages.length - 1 ? [{
        type: "Feature",
        geometry: {type: "LineString", coordinates: stages.slice(activeIndex).map((stage) => stage.coordinates)}
      }] : []
    };
  }

  function setActiveStage(index, moveCamera = true) {
    const stage = stages[index];
    activeStageIndex = index;
    stageElements.forEach((element) => {
      const isActive = Number(element.dataset.stageIndex) === index;
      element.classList.toggle("is-active", isActive);
      element.setAttribute("aria-current", isActive ? "step" : "false");
    });
    status.element.dataset.stageType = stage.type;
    status.date.textContent = dateRange(stage);
    status.marker.textContent = stage.order;
    status.role.textContent = `${stage.role}, ${stage.location}`;
    updateTimeline(stage);
    if (!mapIsReady) return;
    map.getSource("career-path").setData(pathData(index));
    map.getSource("career-stages").setData(pointsData(index));
    if (moveCamera) {
      const camera = cameraForStage(index);
      map.easeTo({center: camera.center, zoom: camera.zoom, duration: prefersReducedMotion ? 0 : 1100, essential: false});
    }
  }

  function updateTimeline(stage) {
    const year = document.createElement("strong");
    year.textContent = stage.start.slice(0, 4);
    status.timeline.replaceChildren(year, document.createTextNode(` / stage ${stage.order} of ${stages.length}`));
  }

  function cameraForStage(index) {
    const locationCamera = cameraForLocation(index);
    if (locationCamera) return locationCamera;

    const neighbouringStageIndex = index === stages.length - 1 ? index - 1 : index + 1;
    if (neighbouringStageIndex < 0 || neighbouringStageIndex >= stages.length) {
      return {center: stages[index].coordinates, zoom: 6.8};
    }

    const distance = distanceInKilometres(stages[index].coordinates, stages[neighbouringStageIndex].coordinates);
    if (distance < 12) {
      return {
        center: [
          (stages[index].coordinates[0] + stages[neighbouringStageIndex].coordinates[0]) / 2,
          (stages[index].coordinates[1] + stages[neighbouringStageIndex].coordinates[1]) / 2
        ],
        zoom: 10.5
      };
    }
    return {center: stages[index].coordinates, zoom: 6.8};
  }

  function cameraForLocation(index) {
    const locationStages = stagesByLocation.get(stages[index].location);
    if (locationStages.length < 2) return null;

    const greatestDistance = Math.max(...locationStages.flatMap((stage, stageIndex) =>
      locationStages.slice(stageIndex + 1).map((otherStage) =>
        distanceInKilometres(stage.coordinates, otherStage.coordinates)
      )
    ));
    const center = locationStages.reduce((totals, stage) => [
      totals[0] + stage.coordinates[0] / locationStages.length,
      totals[1] + stage.coordinates[1] / locationStages.length
    ], [0, 0]);

    if (greatestDistance < 2) return {center, zoom: 13.2};
    if (greatestDistance < 12) return {center, zoom: 10.7};
    return {center, zoom: 8.5};
  }

  function distanceInKilometres(first, second) {
    const radians = Math.PI / 180;
    const latitudeDelta = (second[1] - first[1]) * radians;
    const longitudeDelta = (second[0] - first[0]) * radians;
    const a = Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(first[1] * radians) * Math.cos(second[1] * radians) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function dateRange(stage) {
    const start = new Date(`${stage.start}-01T00:00:00`).toLocaleDateString("en-GB", {month: "short", year: "numeric"});
    if (!stage.end) return `${start} to present`;
    const end = new Date(`${stage.end}-01T00:00:00`).toLocaleDateString("en-GB", {month: "short", year: "numeric"});
    return `${start} to ${end}`;
  }

  const observer = new IntersectionObserver((entries) => {
    const active = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (active) setActiveStage(Number(active.target.dataset.stageIndex));
  }, {rootMargin: "-22% 0px -55% 0px", threshold: [0.15, 0.5]});

  stageElements.forEach((element) => observer.observe(element));
})();
