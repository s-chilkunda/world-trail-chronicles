// script.js
// This file powers the interactive visited countries timeline. It uses amCharts 5
// to render a 3D globe or flat world map and overlays visited countries loaded
// from visits.json based on the selected year.

(function() {
  // Array to hold visit records: { year: Number, country: String }
  const visits = [];

  // Map of country codes to country names for quick lookup when displaying
  const countryMap = {};

  // Curated vibrant highlight palette for playback so every year stays legible and cohesive
  const PLAYBACK_PALETTE = [
    0xf97316, // Coral Orange
    0x0ea5e9, // Sky Blue
    0x10b981, // Emerald
    0x8b5cf6, // Violet
    0xec4899, // Rose
    0xf59e0b, // Amber
    0x14b8a6, // Teal
    0x6366f1  // Indigo
  ];

  // Map palettes for Light and Dark modes
  const MAP_THEMES = {
    light: {
      defaultFill: 0xe2e8f0,
      visitedPastFill: 0x475569,
      visitedCurrentFill: 0xf97316,
      hoverFill: 0x94a3b8,
      defaultStroke: 0xffffff,
      selectedStroke: 0x1d4ed8,
      oceanFill: 0xdbeafe,
      oceanStroke: 0x93c5fd,
      graticuleStroke: 0x60a5fa
    },
    dark: {
      defaultFill: 0x1e293b,
      visitedPastFill: 0x64748b,
      visitedCurrentFill: 0xf97316,
      hoverFill: 0x334155,
      defaultStroke: 0x0f172a,
      selectedStroke: 0x60a5fa,
      oceanFill: 0x0c192c,
      oceanStroke: 0x1e3a8a,
      graticuleStroke: 0x38bdf8
    }
  };

  // Wait for the DOM to finish loading
  window.addEventListener('load', () => {
    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');
    const countryCountEl = document.getElementById('country-count');
    const flagRowEl = document.getElementById('flag-row');
    const chartDivEl = document.getElementById('chartdiv');
    const mapLabel = document.getElementById('map-label');
    const playButton = document.getElementById('play-button');
    const resetButton = document.getElementById('reset-button');

    // Theme toggle elements
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');

    // Projection toggle buttons
    const flatModeBtn = document.getElementById('flat-mode-btn');
    const globeModeBtn = document.getElementById('globe-mode-btn');

    // Visit history popover elements
    const visitPopover = document.getElementById('visit-popover');
    const popoverFlag = document.getElementById('popover-flag');
    const popoverCountry = document.getElementById('popover-country');
    const popoverSubtitle = document.getElementById('popover-subtitle');
    const popoverYears = document.getElementById('popover-years');
    const popoverClose = document.getElementById('popover-close');

    // Playback, readiness & interaction state (3D Globe enabled by default)
    let playInterval = null;
    let isPlaying = false;
    let isGlobe = true;
    let selectedCountryCode = null;
    let dataLoaded = false;
    let mapReady = false;
    let hasAutoPlayed = false;

    // Determine initial theme from localStorage or OS preference
    let currentTheme = 'light';
    try {
      const saved = localStorage.getItem('time-trails-theme');
      if (saved === 'dark' || saved === 'light') {
        currentTheme = saved;
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        currentTheme = 'dark';
      }
    } catch (e) {
      // Ignore storage access errors
    }

    // Playback speed in milliseconds. Increase to slow down or decrease to speed up.
    const PLAY_DELAY_MS = 1500;

    // Track currently rendered flags so existing flags don't flicker during playback
    let renderedFlags = [];

    // Colors for different map states
    let defaultColor;
    let visitedPastColor;
    let visitedCurrentColor;
    let defaultStrokeColor;
    let selectedStrokeColor;

    // Variables to hold amCharts objects
    let root;
    let chart;
    let backgroundSeries;
    let graticuleSeries;
    let polygonSeries;

    // Apply Light or Dark theme to DOM and amCharts map
    function applyTheme(theme) {
      currentTheme = theme === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', currentTheme);

      if (themeIcon && themeText && themeToggleBtn) {
        if (currentTheme === 'dark') {
          themeIcon.textContent = '☀️';
          themeText.textContent = 'Light';
          themeToggleBtn.setAttribute('aria-label', 'Switch to light mode');
        } else {
          themeIcon.textContent = '🌙';
          themeText.textContent = 'Dark';
          themeToggleBtn.setAttribute('aria-label', 'Switch to dark mode');
        }
      }

      try {
        localStorage.setItem('time-trails-theme', currentTheme);
      } catch (e) {
        // Ignore storage access errors
      }

      applyMapTheme();
    }

    // Sync amCharts colors with the active theme
    function applyMapTheme() {
      if (!polygonSeries || !backgroundSeries || !graticuleSeries) return;
      const palette = MAP_THEMES[currentTheme];

      defaultColor = am5.color(palette.defaultFill);
      visitedPastColor = am5.color(palette.visitedPastFill);
      visitedCurrentColor = am5.color(palette.visitedCurrentFill);
      defaultStrokeColor = am5.color(palette.defaultStroke);
      selectedStrokeColor = am5.color(palette.selectedStroke);

      backgroundSeries.mapPolygons.template.setAll({
        fill: am5.color(palette.oceanFill),
        stroke: am5.color(palette.oceanStroke)
      });
      backgroundSeries.mapPolygons.each(polygon => {
        polygon.setAll({
          fill: am5.color(palette.oceanFill),
          stroke: am5.color(palette.oceanStroke)
        });
      });

      graticuleSeries.mapLines.template.setAll({
        stroke: am5.color(palette.graticuleStroke),
        strokeOpacity: currentTheme === 'dark' ? 0.18 : 0.25
      });
      graticuleSeries.mapLines.each(line => {
        line.setAll({
          stroke: am5.color(palette.graticuleStroke),
          strokeOpacity: currentTheme === 'dark' ? 0.18 : 0.25
        });
      });

      polygonSeries.mapPolygons.template.states.create('hover', {
        fill: am5.color(palette.hoverFill)
      });

      updateMap(parseInt(yearSlider.value, 10));
    }

    // Apply initial theme to UI right away
    applyTheme(currentTheme);

    // Auto-play once both visits.json and the amCharts map are ready
    function maybeAutoPlay() {
      if (dataLoaded && mapReady && !hasAutoPlayed && visits.length > 0) {
        hasAutoPlayed = true;
        setTimeout(() => {
          if (!isPlaying) {
            startPlayback();
          }
        }, 400);
      }
    }

    // Always load visits directly from visits.json so direct file edits take effect immediately
    fetch('visits.json')
      .then(resp => resp.json())
      .then(data => {
        const rawList = Array.isArray(data)
          ? data
          : (data && Array.isArray(data.visits) ? data.visits : []);

        const converted = rawList
          .map(item => {
            const y = parseInt(item.year, 10);
            if (Number.isFinite(y) && typeof item.country === 'string') {
              return { year: y, country: item.country };
            }
            return null;
          })
          .filter(Boolean)
          .sort((a, b) => a.year - b.year);

        visits.push(...converted);
        updateSliderRange();
        yearSlider.value = parseInt(yearSlider.min, 10);
        updateMap(parseInt(yearSlider.value, 10));
        dataLoaded = true;
        maybeAutoPlay();
      })
      .catch(err => console.error('Error loading visits.json:', err));

    // Set default slider range until visits.json finishes loading
    updateSliderRange();
    yearSlider.value = parseInt(yearSlider.min, 10);
    yearLabel.textContent = yearSlider.value;
    updateSliderFill();

    // Sync the CSS progress fill along the range slider track
    function updateSliderFill() {
      const min = parseFloat(yearSlider.min) || 0;
      const max = parseFloat(yearSlider.max) || 100;
      const val = parseFloat(yearSlider.value) || min;
      const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
      yearSlider.style.setProperty('--slider-progress', `${pct}%`);
    }

    // Recalculate the slider's min and max years based on visits
    function updateSliderRange() {
      yearSlider.min = 1980;
      yearSlider.max = 2030;

      if (visits.length > 0) {
        const years = visits
          .map(rec => parseInt(rec.year, 10))
          .filter(y => Number.isFinite(y));
        if (years.length > 0) {
          const minYear = Math.min(...years);
          const maxYear = Math.max(...years);
          yearSlider.min = minYear - 1;
          yearSlider.max = maxYear + 1;
        }
      }

      const minVal = parseInt(yearSlider.min, 10);
      const maxVal = parseInt(yearSlider.max, 10);
      let currentVal = parseInt(yearSlider.value, 10);
      if (currentVal < minVal) currentVal = minVal;
      if (currentVal > maxVal) currentVal = maxVal;
      yearSlider.value = currentVal;
      yearLabel.textContent = yearSlider.value;
      updateSliderFill();
    }

    // Return sorted unique years visited for a given country code
    function getVisitYearsForCountry(code) {
      const years = visits
        .filter(r => r.country === code)
        .map(r => r.year);
      return Array.from(new Set(years)).sort((a, b) => a - b);
    }

    // Rotate 3D globe smoothly along the shortest path toward the selected country
    function focusCountryOnMap(code, duration = 850) {
      if (!polygonSeries || !chart || !isGlobe) return;
      const dataItem = polygonSeries.getDataItemById(code);
      if (!dataItem) return;
      const polygon = dataItem.get('mapPolygon');
      if (!polygon) return;

      const centroid = polygon.visualCentroid();
      if (centroid && Number.isFinite(centroid.longitude) && Number.isFinite(centroid.latitude)) {
        const currentRotX = chart.get('rotationX') || 0;
        const rawTargetX = -centroid.longitude;
        const shortestDeltaX = (((rawTargetX - currentRotX + 180) % 360) + 360) % 360 - 180;
        const targetRotX = currentRotX + shortestDeltaX;

        chart.animate({
          key: 'rotationX',
          to: targetRotX,
          duration,
          easing: am5.ease.out(am5.ease.cubic)
        });
        chart.animate({
          key: 'rotationY',
          to: -centroid.latitude,
          duration,
          easing: am5.ease.out(am5.ease.cubic)
        });
      }
    }

    // Sync active ring state on flag buttons
    function syncActiveFlagButton() {
      if (!flagRowEl) return;
      Array.from(flagRowEl.children).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.code === selectedCountryCode);
      });
    }

    // Open visit history popover for a country
    function openVisitPopover(code, shouldFocusMap = true) {
      const years = getVisitYearsForCountry(code);
      if (years.length === 0 || !visitPopover) return;

      selectedCountryCode = code;
      const lowerCode = code.toLowerCase();
      const name = countryMap[code] || code;
      const activeYear = parseInt(yearSlider.value, 10);

      popoverFlag.src = `https://flagcdn.com/w40/${lowerCode}.png`;
      popoverFlag.srcset = `https://flagcdn.com/w80/${lowerCode}.png 2x`;
      popoverFlag.alt = name;
      popoverCountry.textContent = name;
      popoverSubtitle.textContent = years.length === 1
        ? '1 logged visit'
        : `${years.length} logged visits`;

      popoverYears.innerHTML = '';
      years.forEach(yr => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'popover-year-pill';
        if (yr === activeYear) {
          pill.classList.add('current');
        }
        pill.textContent = yr;
        pill.title = `Jump timeline to ${yr}`;
        pill.addEventListener('click', () => {
          stopPlayback();
          yearSlider.value = yr;
          updateMap(yr);
        });
        popoverYears.appendChild(pill);
      });

      visitPopover.hidden = false;
      syncActiveFlagButton();
      applySelectedCountryHighlight();
      if (shouldFocusMap) {
        focusCountryOnMap(code);
      }
    }

    // Close visit history popover and clear selection
    function closeVisitPopover() {
      selectedCountryCode = null;
      if (visitPopover) {
        visitPopover.hidden = true;
      }
      syncActiveFlagButton();
      applySelectedCountryHighlight();
    }

    // Apply or clear the highlight stroke on the selected country polygon
    function applySelectedCountryHighlight() {
      if (!polygonSeries) return;
      polygonSeries.mapPolygons.each(function(polygon) {
        polygon.setAll({
          stroke: defaultStrokeColor,
          strokeWidth: 0.7
        });
      });

      if (selectedCountryCode) {
        const dataItem = polygonSeries.getDataItemById(selectedCountryCode);
        if (dataItem) {
          const polygon = dataItem.get('mapPolygon');
          if (polygon) {
            polygon.setAll({
              stroke: selectedStrokeColor,
              strokeWidth: 2
            });
            polygon.toFront();
          }
        }
      }
    }

    // Smoothly update clickable flags without flickering existing ones
    function updateFlags(uniqueCountries) {
      if (!flagRowEl) return;

      let prefixMatch = 0;
      while (
        prefixMatch < renderedFlags.length &&
        prefixMatch < uniqueCountries.length &&
        renderedFlags[prefixMatch] === uniqueCountries[prefixMatch]
      ) {
        prefixMatch++;
      }

      while (flagRowEl.children.length > prefixMatch) {
        flagRowEl.removeChild(flagRowEl.lastChild);
      }

      for (let i = prefixMatch; i < uniqueCountries.length; i++) {
        const code = uniqueCountries[i];
        const lowerCode = code.toLowerCase();
        const name = countryMap[code] || code;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'country-flag-btn';
        btn.dataset.code = code;
        btn.title = `${name} — click for visit history`;
        btn.setAttribute('aria-label', `${name} visit history`);

        const img = document.createElement('img');
        img.src = `https://flagcdn.com/w40/${lowerCode}.png`;
        img.srcset = `https://flagcdn.com/w80/${lowerCode}.png 2x`;
        img.alt = name;
        img.className = 'country-flag';

        btn.appendChild(img);
        btn.addEventListener('click', () => {
          if (selectedCountryCode === code && !visitPopover.hidden) {
            closeVisitPopover();
          } else {
            openVisitPopover(code, true);
          }
        });

        flagRowEl.appendChild(btn);
      }

      // Refresh titles once countryMap finishes loading
      Array.from(flagRowEl.children).forEach((btn, idx) => {
        const code = uniqueCountries[idx];
        const name = countryMap[code] || code;
        const img = btn.querySelector('img');
        btn.title = `${name} — click for visit history`;
        btn.setAttribute('aria-label', `${name} visit history`);
        if (img && img.alt !== name) {
          img.alt = name;
        }
      });

      renderedFlags = uniqueCountries.slice();
      syncActiveFlagButton();
    }

    // Update map colors, flags, slider fill, popover active year, and counter
    function updateMap(year) {
      yearLabel.textContent = year;
      updateSliderFill();

      const visitedPast = [];
      const visitedCurrent = [];
      const uniqueCountries = [];
      const seen = new Set();

      for (const record of visits) {
        if (record.year <= year && !seen.has(record.country)) {
          seen.add(record.country);
          uniqueCountries.push(record.country);
        }
        if (record.year < year) {
          visitedPast.push(record.country);
        } else if (record.year === year) {
          visitedCurrent.push(record.country);
        }
      }

      if (countryCountEl) {
        countryCountEl.textContent = uniqueCountries.length;
      }

      updateFlags(uniqueCountries);

      // Keep active year pill synced if popover is open
      if (selectedCountryCode && visitPopover && !visitPopover.hidden) {
        Array.from(popoverYears.children).forEach(pill => {
          pill.classList.toggle('current', parseInt(pill.textContent, 10) === year);
        });
      }

      if (mapLabel) {
        const names = visitedCurrent
          .map(code => countryMap[code])
          .filter(Boolean);
        if (names.length > 0) {
          mapLabel.textContent = names.join(' · ');
          mapLabel.style.display = 'block';
        } else {
          mapLabel.textContent = '';
          mapLabel.style.display = 'none';
        }
      }

      if (!polygonSeries) return;

      // Reset all countries to default fill
      polygonSeries.mapPolygons.each(function(polygon) {
        polygon.set('fill', defaultColor);
      });

      // Colour countries visited in previous years
      visitedPast.forEach(code => {
        const dataItem = polygonSeries.getDataItemById(code);
        if (dataItem) {
          dataItem.get('mapPolygon').set('fill', visitedPastColor);
        }
      });

      // Highlight countries visited in the selected year
      visitedCurrent.forEach((code, idx) => {
        const dataItem = polygonSeries.getDataItemById(code);
        if (dataItem) {
          const paletteColor = PLAYBACK_PALETTE[(year + idx) % PLAYBACK_PALETTE.length];
          const colour = isPlaying ? am5.color(paletteColor) : visitedCurrentColor;
          dataItem.get('mapPolygon').set('fill', colour);
        }
      });

      // While playing in 3D Globe mode, smoothly rotate to center the first country of this year
      if (isPlaying && isGlobe && visitedCurrent.length > 0) {
        focusCountryOnMap(visitedCurrent[0], 900);
      }

      applySelectedCountryHighlight();
    }

    // Switch between Flat (Mercator) and 3D Globe (Orthographic) projections
    function setMapMode(globeMode) {
      if (isGlobe === globeMode && chart) return;
      isGlobe = globeMode;

      flatModeBtn.classList.toggle('active', !isGlobe);
      globeModeBtn.classList.toggle('active', isGlobe);
      flatModeBtn.setAttribute('aria-pressed', String(!isGlobe));
      globeModeBtn.setAttribute('aria-pressed', String(isGlobe));

      if (!chart) return;

      if (isGlobe) {
        chart.set('projection', am5map.geoOrthographic());
        chart.set('panX', 'rotateX');
        chart.set('panY', 'rotateY');
        backgroundSeries.show();
        graticuleSeries.show();
        chartDivEl.classList.add('globe-mode');
        chart.goHome();
        if (selectedCountryCode) {
          focusCountryOnMap(selectedCountryCode);
        }
      } else {
        chart.set('projection', am5map.geoMercator());
        chart.set('panX', 'translateX');
        chart.set('panY', 'translateY');
        chart.set('rotationX', 0);
        chart.set('rotationY', 0);
        backgroundSeries.hide();
        graticuleSeries.hide();
        chartDivEl.classList.remove('globe-mode');
        chart.goHome();
      }
    }

    // Populate the country code -> name lookup map from geodata
    function populateCountryMap() {
      const features = am5geodata_worldIndiaLow.features;
      for (const feature of features) {
        countryMap[feature.id] = feature.properties.name;
      }
    }

    // Initialize the amCharts map in 3D Globe mode by default
    am5.ready(function() {
      const palette = MAP_THEMES[currentTheme];

      root = am5.Root.new('chartdiv');
      if (root._logo) {
        root._logo.dispose();
      }
      root.setThemes([am5themes_Animated.new(root)]);

      chart = root.container.children.push(am5map.MapChart.new(root, {
        panX: 'rotateX',
        panY: 'rotateY',
        projection: am5map.geoOrthographic()
      }));

      // Circular ocean sphere backdrop (visible by default in 3D Globe mode)
      backgroundSeries = chart.series.push(am5map.MapPolygonSeries.new(root, {}));
      backgroundSeries.mapPolygons.template.setAll({
        fill: am5.color(palette.oceanFill),
        fillOpacity: 1,
        stroke: am5.color(palette.oceanStroke),
        strokeWidth: 1.2
      });
      backgroundSeries.data.push({
        geometry: am5map.getGeoRectangle(90, 180, -90, -180)
      });

      // Subtle latitude/longitude grid lines (visible by default in 3D Globe mode)
      graticuleSeries = chart.series.push(am5map.GraticuleSeries.new(root, {}));
      graticuleSeries.mapLines.template.setAll({
        stroke: am5.color(palette.graticuleStroke),
        strokeOpacity: currentTheme === 'dark' ? 0.18 : 0.25
      });

      polygonSeries = chart.series.push(am5map.MapPolygonSeries.new(root, {
        // Use the India-specific world map so contested regions like Kashmir are shown as part of India
        geoJSON: am5geodata_worldIndiaLow
      }));

      defaultColor = am5.color(palette.defaultFill);
      visitedPastColor = am5.color(palette.visitedPastFill);
      visitedCurrentColor = am5.color(palette.visitedCurrentFill);
      defaultStrokeColor = am5.color(palette.defaultStroke);
      selectedStrokeColor = am5.color(palette.selectedStroke);

      polygonSeries.mapPolygons.template.setAll({
        tooltipText: '{name}',
        fill: defaultColor,
        stroke: defaultStrokeColor,
        strokeWidth: 0.7,
        interactive: true,
        cursorOverStyle: 'pointer'
      });

      polygonSeries.mapPolygons.template.states.create('hover', {
        fill: am5.color(palette.hoverFill)
      });

      // Clicking a visited country directly on the map opens its visit history popover
      polygonSeries.mapPolygons.template.events.on('click', function(ev) {
        const dataItem = ev.target.dataItem;
        const code = dataItem && dataItem.get('id');
        if (!code) return;

        const years = getVisitYearsForCountry(code);
        if (years.length > 0) {
          openVisitPopover(code, true);
        } else {
          closeVisitPopover();
        }
      });

      chartDivEl.classList.add('globe-mode');
      populateCountryMap();
      updateMap(parseInt(yearSlider.value, 10));
      mapReady = true;
      maybeAutoPlay();
    });

    function startPlayback() {
      if (isPlaying) return;
      isPlaying = true;
      playButton.classList.add('playing');
      playButton.textContent = '⏸ Pause';
      yearSlider.value = parseInt(yearSlider.min, 10);
      updateMap(parseInt(yearSlider.value, 10));

      playInterval = setInterval(() => {
        const currentYear = parseInt(yearSlider.value, 10);
        const minYear = parseInt(yearSlider.min, 10);
        const maxYear = parseInt(yearSlider.max, 10);
        const nextYear = currentYear >= maxYear ? minYear : currentYear + 1;
        yearSlider.value = nextYear;
        updateMap(nextYear);
      }, PLAY_DELAY_MS);
    }

    function stopPlayback() {
      if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
      }
      isPlaying = false;
      playButton.classList.remove('playing');
      playButton.textContent = '▶ Play';
    }

    // Theme toggle listener
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
      });
    }

    // Projection toggle listeners
    flatModeBtn.addEventListener('click', () => setMapMode(false));
    globeModeBtn.addEventListener('click', () => setMapMode(true));

    // Close popover via button or Escape key
    popoverClose.addEventListener('click', closeVisitPopover);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && visitPopover && !visitPopover.hidden) {
        closeVisitPopover();
      }
    });

    // Update the map when the slider moves
    yearSlider.addEventListener('input', () => {
      const year = parseInt(yearSlider.value, 10);
      updateMap(year);
    });

    // Play/Pause button functionality
    playButton.addEventListener('click', () => {
      if (!isPlaying) {
        startPlayback();
      } else {
        stopPlayback();
      }
    });

    // Reset button functionality
    resetButton.addEventListener('click', () => {
      stopPlayback();
      closeVisitPopover();
      yearSlider.value = parseInt(yearSlider.min, 10);
      updateMap(parseInt(yearSlider.value, 10));
    });
  });
})();