// script.js
// This file powers the interactive visited countries timeline. It uses amCharts 5
// to render a world map and overlays visited countries loaded from visits.json
// based on the selected year.

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

  // Wait for the DOM to finish loading
  window.addEventListener('load', () => {
    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');
    const countryCountEl = document.getElementById('country-count');
    const flagRowEl = document.getElementById('flag-row');
    const mapLabel = document.getElementById('map-label');
    const playButton = document.getElementById('play-button');
    const resetButton = document.getElementById('reset-button');

    // Playback state variables
    let playInterval = null;
    let isPlaying = false;

    // Playback speed in milliseconds. Increase to slow down or decrease to speed up.
    const PLAY_DELAY_MS = 1500;

    // Track currently rendered flags so existing flags don't flicker during playback
    let renderedFlags = [];

    // Colors for different map states
    let defaultColor;
    let visitedPastColor;
    let visitedCurrentColor;

    // Variables to hold amCharts objects
    let root;
    let polygonSeries;

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

    // Smoothly update flags without flickering existing ones
    function updateFlags(uniqueCountries) {
      if (!flagRowEl) return;

      // Keep existing prefix intact if it matches, only adding/removing the difference
      let prefixMatch = 0;
      while (
        prefixMatch < renderedFlags.length &&
        prefixMatch < uniqueCountries.length &&
        renderedFlags[prefixMatch] === uniqueCountries[prefixMatch]
      ) {
        prefixMatch++;
      }

      // Remove flags that are beyond the new year
      while (flagRowEl.children.length > prefixMatch) {
        flagRowEl.removeChild(flagRowEl.lastChild);
      }

      // Append any newly visited country flags
      for (let i = prefixMatch; i < uniqueCountries.length; i++) {
        const code = uniqueCountries[i];
        const img = document.createElement('img');
        const lowerCode = code.toLowerCase();
        const name = countryMap[code] || code;
        img.src = `https://flagcdn.com/w40/${lowerCode}.png`;
        img.srcset = `https://flagcdn.com/w80/${lowerCode}.png 2x`;
        img.alt = name;
        img.title = name;
        img.className = 'country-flag';
        flagRowEl.appendChild(img);
      }

      // Refresh alt/title once countryMap finishes loading
      Array.from(flagRowEl.children).forEach((img, idx) => {
        const code = uniqueCountries[idx];
        const name = countryMap[code] || code;
        if (img.title !== name) {
          img.alt = name;
          img.title = name;
        }
      });

      renderedFlags = uniqueCountries.slice();
    }

    // Update map colors, flags, slider fill, and counter based on the selected year
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
    }

    // Populate the country code -> name lookup map from geodata
    function populateCountryMap() {
      const features = am5geodata_worldIndiaLow.features;
      for (const feature of features) {
        countryMap[feature.id] = feature.properties.name;
      }
    }

    // Initialize the amCharts map
    am5.ready(function() {
      root = am5.Root.new('chartdiv');
      root.setThemes([am5themes_Animated.new(root)]);

      const chart = root.container.children.push(am5map.MapChart.new(root, {
        panX: 'rotateX',
        panY: 'rotateY',
        projection: am5map.geoMercator()
      }));

      polygonSeries = chart.series.push(am5map.MapPolygonSeries.new(root, {
        // Use the India-specific world map so contested regions like Kashmir are shown as part of India
        geoJSON: am5geodata_worldIndiaLow
      }));

      polygonSeries.mapPolygons.template.setAll({
        tooltipText: '{name}',
        fill: am5.color(0xe2e8f0),
        stroke: am5.color(0xffffff),
        strokeWidth: 0.7
      });

      defaultColor = am5.color(0xe2e8f0);
      visitedPastColor = am5.color(0x475569);
      visitedCurrentColor = am5.color(0xf97316);

      polygonSeries.mapPolygons.template.states.create('hover', {
        fill: am5.color(0x94a3b8)
      });

      populateCountryMap();
      updateMap(parseInt(yearSlider.value, 10));
    });

    function stopPlayback() {
      if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
      }
      isPlaying = false;
      playButton.classList.remove('playing');
      playButton.textContent = '▶ Play';
    }

    // Update the map when the slider moves
    yearSlider.addEventListener('input', () => {
      const year = parseInt(yearSlider.value, 10);
      updateMap(year);
    });

    // Play/Pause button functionality
    playButton.addEventListener('click', () => {
      if (!isPlaying) {
        isPlaying = true;
        playButton.classList.add('playing');
        playButton.textContent = '⏸ Pause';
        yearSlider.value = parseInt(yearSlider.min, 10);
        updateMap(parseInt(yearSlider.value, 10));

        playInterval = setInterval(() => {
          const currentYear = parseInt(yearSlider.value, 10);
          const maxYear = parseInt(yearSlider.max, 10);
          if (currentYear >= maxYear) {
            stopPlayback();
          } else {
            const nextYear = currentYear + 1;
            yearSlider.value = nextYear;
            updateMap(nextYear);
          }
        }, PLAY_DELAY_MS);
      } else {
        stopPlayback();
      }
    });

    // Reset button functionality
    resetButton.addEventListener('click', () => {
      stopPlayback();
      yearSlider.value = parseInt(yearSlider.min, 10);
      updateMap(parseInt(yearSlider.value, 10));
    });
  });
})();
