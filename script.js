// script.js
// This file powers the interactive visited countries timeline. It uses amCharts 5
// to render a world map and overlays visited countries loaded from visits.json
// based on the selected year.

(function() {
  // Array to hold visit records: { year: Number, country: String }
  const visits = [];

  // Map of country codes to country names for quick lookup when displaying
  const countryMap = {};

  // Wait for the DOM to finish loading
  window.addEventListener('load', () => {
    // Grab references to DOM elements
    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');
    const countryCountEl = document.getElementById('country-count');
    const flagRowEl = document.getElementById('flag-row');
    // Overlay element for showing country names during playback on top of the map
    const mapLabel = document.getElementById('map-label');
    const playButton = document.getElementById('play-button');
    const resetButton = document.getElementById('reset-button');

    // Playback state variables
    let playInterval = null;
    let isPlaying = false;

    // Playback speed in milliseconds. Increase to slow down or decrease to speed up.
    const PLAY_DELAY_MS = 1500;

    // Colors for different states
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
        // Start the timeline at the beginning of the computed range
        yearSlider.value = parseInt(yearSlider.min, 10);
        updateMap(parseInt(yearSlider.value, 10));
      })
      .catch(err => console.error('Error loading visits.json:', err));

    // Set default slider range until visits.json finishes loading
    updateSliderRange();
    yearSlider.value = parseInt(yearSlider.min, 10);
    yearLabel.textContent = yearSlider.value;

    // Function to recalculate the slider's min and max years based on visits
    function updateSliderRange() {
      // Default slider range to 1980–2030
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

      // Ensure current slider value stays within the computed range
      const minVal = parseInt(yearSlider.min, 10);
      const maxVal = parseInt(yearSlider.max, 10);
      let currentVal = parseInt(yearSlider.value, 10);
      if (currentVal < minVal) currentVal = minVal;
      if (currentVal > maxVal) currentVal = maxVal;
      yearSlider.value = currentVal;
      yearLabel.textContent = yearSlider.value;
    }

    // Render small flags for every unique country visited up to the given year
    function updateFlags(uniqueCountries) {
      if (!flagRowEl) return;
      flagRowEl.innerHTML = '';

      uniqueCountries.forEach(code => {
        const img = document.createElement('img');
        const lowerCode = code.toLowerCase();
        const name = countryMap[code] || code;
        img.src = `https://flagcdn.com/w40/${lowerCode}.png`;
        img.srcset = `https://flagcdn.com/w80/${lowerCode}.png 2x`;
        img.alt = name;
        img.title = name;
        img.className = 'country-flag';
        flagRowEl.appendChild(img);
      });
    }

    // Function to update the map colors, flags, and counter based on the selected year
    function updateMap(year) {
      yearLabel.textContent = year;

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

      // Update the unique countries counter up to the currently selected year
      if (countryCountEl) {
        countryCountEl.textContent = uniqueCountries.length;
      }

      // Update the concatenated flag row between the slider and the map
      updateFlags(uniqueCountries);

      // Update the overlay with the names of countries visited in the selected year
      if (mapLabel) {
        const names = visitedCurrent
          .map(code => countryMap[code])
          .filter(Boolean);
        if (names.length > 0) {
          mapLabel.textContent = names.join(', ');
          mapLabel.style.display = 'block';
        } else {
          mapLabel.textContent = '';
          mapLabel.style.display = 'none';
        }
      }

      if (!polygonSeries) return;

      // Reset all countries to the default colour
      polygonSeries.mapPolygons.each(function(polygon) {
        polygon.set('fill', defaultColor);
      });

      // Colour the countries visited in previous years
      visitedPast.forEach(code => {
        const dataItem = polygonSeries.getDataItemById(code);
        if (dataItem) {
          dataItem.get('mapPolygon').set('fill', visitedPastColor);
        }
      });

      // Highlight the countries visited in the selected year
      visitedCurrent.forEach(code => {
        const dataItem = polygonSeries.getDataItemById(code);
        if (dataItem) {
          const colour = isPlaying
            ? am5.color(Math.floor(Math.random() * 0xffffff))
            : visitedCurrentColor;
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
        fill: am5.color(0xdedede),
        stroke: am5.color(0xffffff),
        strokeWidth: 0.7
      });

      defaultColor = am5.color(0xdedede);
      visitedPastColor = am5.color(0x666666);
      visitedCurrentColor = am5.color(0xff5722);

      polygonSeries.mapPolygons.template.states.create('hover', {
        fill: am5.color(0xaaaaaa)
      });

      populateCountryMap();
      updateMap(parseInt(yearSlider.value, 10));
    });

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
        playButton.textContent = 'Pause';
        yearSlider.value = parseInt(yearSlider.min, 10);
        updateMap(parseInt(yearSlider.value, 10));

        playInterval = setInterval(() => {
          const currentYear = parseInt(yearSlider.value, 10);
          const maxYear = parseInt(yearSlider.max, 10);
          if (currentYear >= maxYear) {
            clearInterval(playInterval);
            isPlaying = false;
            playButton.classList.remove('playing');
            playButton.textContent = 'Play';
          } else {
            const nextYear = currentYear + 1;
            yearSlider.value = nextYear;
            updateMap(nextYear);
          }
        }, PLAY_DELAY_MS);
      } else {
        clearInterval(playInterval);
        isPlaying = false;
        playButton.classList.remove('playing');
        playButton.textContent = 'Play';
      }
    });

    // Reset button functionality
    resetButton.addEventListener('click', () => {
      if (isPlaying) {
        clearInterval(playInterval);
        isPlaying = false;
        playButton.classList.remove('playing');
        playButton.textContent = 'Play';
      }
      yearSlider.value = parseInt(yearSlider.min, 10);
      updateMap(parseInt(yearSlider.value, 10));
    });
  });
})();
