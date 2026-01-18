// script.js
// This file powers the interactive visited countries timeline. It uses amCharts 5
// to render a world map and overlays visited countries based on the selected
// year. Users can add new visits by specifying a year and choosing a country
// from the dynamically populated list.

(function() {
  // Baseline year. The map will be empty prior to this year.  
  // We set baseline equal to the earliest year we want to show on the slider (1980), so countries remain uncolored before visits.
  const BASELINE_YEAR = 1980;

  // Array to hold visit records: { year: Number, country: String }
  const visits = [];

  // Map of country codes to country names for quick lookup when displaying
  const countryMap = {};

  // Edit key for entering edit mode.  You should change this value to
  // something private before deploying your site.  When the user clicks
  // "Edit", they will be prompted for this key.  If they enter
  // it correctly, edit mode is enabled.  Otherwise, the site remains in
  // read‑only mode.
  const EDIT_KEY = 'change_me';

  // Track whether we are currently in edit mode.  When editMode is true,
  // the controls for adding/editing visits and the visit list are visible.
  let editMode = false;
  // Track the index of the visit currently being edited.  If null, we are
  // adding a new visit; if a number, we are updating an existing entry.
  let editingIndex = null;

  // Wait for the DOM to finish loading
  window.addEventListener('load', () => {
    // Grab references to DOM elements
    // Reference the year select dropdown instead of a text input
    const yearSelect = document.getElementById('year-select');
    const countrySelect = document.getElementById('country-select');
    const addVisitBtn = document.getElementById('add-visit');
    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');
    // Overlay element for showing country names during playback on top of the map
    const mapLabel = document.getElementById('map-label');
    const playButton = document.getElementById('play-button');

    // Elements for edit mode and visit management
    const toggleEditBtn = document.getElementById('toggle-edit');
    const visitControls = document.getElementById('visit-controls');
    const visitListContainer = document.getElementById('visit-list-container');
    const visitListTableBody = document.querySelector('#visit-list tbody');

    // Playback state variables
    let playInterval = null;
    let isPlaying = false;

    // Playback speed in milliseconds. This constant controls how quickly
    // the timeline advances when the Play button is activated. Increase
    // this value to slow down playback or decrease it to speed things up.
    const PLAY_DELAY_MS = 1500;

    // Reference the reset button, which resets the timeline to the start
    const resetButton = document.getElementById('reset-button');

    // Load any saved visits from localStorage on startup
    loadVisitsFromStorage();

    // If there’s nothing in localStorage, load the default data from visits.json
    if (visits.length === 0) {
      fetch('visits.json')
        .then(resp => resp.json())
        .then(data => {
          // Convert year strings to numbers and discard any invalid entries
          const converted = Array.isArray(data)
            ? data
                .map(item => {
                  const y = parseInt(item.year, 10);
                  if (Number.isFinite(y) && typeof item.country === 'string') {
                    return { year: y, country: item.country };
                  }
                  return null;
                })
                .filter(Boolean)
            : [];
          visits.push(...converted);
          saveVisitsToStorage();     // persist it locally
          updateSliderRange();       // recalc the timeline range based on new visits
          // Update the map with the current slider value now that visits are loaded.  updateMap
          // will update the overlay even if the map itself isn’t ready yet.
          updateMap(parseInt(yearSlider.value));
          renderVisitList();
        })
        .catch(err => console.error('Error loading visits.json:', err));
    }
    
    // After loading visits, ensure slider range and map reflect saved data
    updateSliderRange();
    // We will call updateMap once the map is ready (inside am5.ready)

    // Initialize the slider based on persisted visits.  After loading any stored
    // visits, updateSliderRange() sets appropriate min and max values.  We then
    // set the slider value to the new minimum so the timeline starts at the
    // earliest year minus two.  If no visits exist, updateSliderRange() will
    // default min and max to 1980 and 2030.
    // Resetting the slider value here ensures the map shows the beginning
    // of the timeline on first load.
    yearSlider.value = parseInt(yearSlider.min);
    yearLabel.textContent = yearSlider.value;

    // Populate the year select dropdown with a range of years.
    // Provide years from 1980 to 2030 as requested.
    function populateYearSelect() {
      // Only populate once: if options already exist beyond the placeholder, skip
      if (yearSelect.options.length > 1) return;
      for (let y = 1980; y <= 2030; y++) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        yearSelect.appendChild(option);
      }
    }

    // Colors for different states
    let defaultColor;
    let visitedPastColor;
    let visitedCurrentColor;

    // Variables to hold amCharts objects
    let root;
    let polygonSeries;

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
      const minVal = parseInt(yearSlider.min);
      const maxVal = parseInt(yearSlider.max);
      let currentVal = parseInt(yearSlider.value);
      if (currentVal < minVal) currentVal = minVal;
      if (currentVal > maxVal) currentVal = maxVal;
      yearSlider.value = currentVal;
      yearLabel.textContent = yearSlider.value;
    }

    // Function to update the map colors based on the selected year
    function updateMap(year) {
      // Update the year label immediately so the UI reflects the slider value even if the map
      // hasn’t finished initializing.
      yearLabel.textContent = year;
      // Determine which countries have been visited before this year and which are visited this year
      const visitedPast = [];
      const visitedCurrent = [];
      for (const record of visits) {
        if (record.year < year) {
          visitedPast.push(record.country);
        } else if (record.year === year) {
          visitedCurrent.push(record.country);
        }
      }
      // Update the overlay with the names of countries visited in the selected year.  This occurs
      // regardless of whether the map has been fully initialised, so that names appear as soon
      // as data is available.  If no countries are visited in the current year, hide the overlay.
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
      // If the polygon series hasn’t been created yet, stop here.  The map will be colored once
      // the amCharts map is ready.
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
      // Highlight the countries visited in the selected year.  Use a random colour when playing;
      // otherwise use a single highlight colour for consistency.
      visitedCurrent.forEach(code => {
        const dataItem = polygonSeries.getDataItemById(code);
        if (dataItem) {
          const colour = isPlaying ? am5.color(Math.floor(Math.random() * 0xffffff)) : visitedCurrentColor;
          dataItem.get('mapPolygon').set('fill', colour);
        }
      });
    }

    // Initialize the amCharts map
    am5.ready(function() {
      // Create root and set theme
      root = am5.Root.new('chartdiv');
      root.setThemes([am5themes_Animated.new(root)]);
      // Create the map chart with a Mercator projection
      const chart = root.container.children.push(am5map.MapChart.new(root, {
        panX: 'rotateX',
        panY: 'rotateY',
        projection: am5map.geoMercator()
      }));
      // Create a polygon series and load the world geodata
      polygonSeries = chart.series.push(am5map.MapPolygonSeries.new(root, {
        // Use the India-specific world map so that contested regions like Kashmir are
        // displayed entirely as part of India. See amCharts documentation for details.
        geoJSON: am5geodata_worldIndiaLow
      }));
      // Set up default styling for map polygons
      polygonSeries.mapPolygons.template.setAll({
        tooltipText: '{name}',
        fill: am5.color(0xdedede),
        stroke: am5.color(0xffffff),
        strokeWidth: 0.7
      });
      // Define colors once we have a root available
      defaultColor = am5.color(0xdedede);
      // Darker shade of grey for countries visited in previous years, for stronger contrast against default color
      // Increased contrast by using a darker tone (0x666666 instead of 0x888888). This makes visited
      // countries stand out more clearly compared with the light default fill.
      visitedPastColor = am5.color(0x666666);
      visitedCurrentColor = am5.color(0xff5722);
      // Create a hover state
      polygonSeries.mapPolygons.template.states.create('hover', {
        fill: am5.color(0xaaaaaa)
      });
      // Populate the country select dropdown using the map's geodata
      populateCountrySelect();
      // Populate the year select with a range of years
      populateYearSelect();
      // Draw the initial map
      updateMap(parseInt(yearSlider.value));
    });

    // Populate country select using features from the loaded geodata
    function populateCountrySelect() {
      // Build an array of { id, name } objects
      // Use the India-specific world data to populate the country list so the feature set matches
      // the map being rendered. This ensures Kashmir is shown as part of India in the map.
      const features = am5geodata_worldIndiaLow.features;
      const countries = features.map(feature => {
        return { id: feature.id, name: feature.properties.name };
      });
      // Sort alphabetically by name
      countries.sort((a, b) => a.name.localeCompare(b.name));
      // Insert each as an option in the select dropdown and fill the country map
      for (const c of countries) {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = `${c.name} (${c.id})`;
        countrySelect.appendChild(option);
        // Store the name for later lookup when displaying visited country names
        countryMap[c.id] = c.name;
      }
    }

    // Add a visit when the button is clicked
    addVisitBtn.addEventListener('click', () => {
      // Only allow adding or updating visits when in edit mode
      if (!editMode) {
        return;
      }
      // Read the selected year from the drop-down
      const year = parseInt(yearSelect.value);
      const country = countrySelect.value;
      // Validate inputs: ensure a year and country have been selected
      if (isNaN(year) || !country) {
        alert('Please select a year and a country before saving the visit.');
        return;
      }
      if (editingIndex !== null && editingIndex >= 0 && editingIndex < visits.length) {
        // Update existing record
        visits[editingIndex] = { year, country };
        editingIndex = null;
        // Reset button text
        addVisitBtn.textContent = 'Add Visit';
      } else {
        // Add new record
        visits.push({ year, country });
      }
      // Reset the selectors back to the default blank option
      yearSelect.value = '';
      countrySelect.value = '';
      // Persist visits to localStorage
      saveVisitsToStorage();
      // Recalculate the slider range and update the map to reflect any changes
      updateSliderRange();
      updateMap(parseInt(yearSlider.value));
      // Re-render the visit list
      renderVisitList();
    });

    // Update the map when the slider moves
    yearSlider.addEventListener('input', () => {
      const year = parseInt(yearSlider.value);
      updateMap(year);
    });

    // Play/Pause button functionality
    playButton.addEventListener('click', () => {
      // If currently not playing, start playback
      if (!isPlaying) {
        isPlaying = true;
        playButton.classList.add('playing');
        playButton.textContent = 'Pause';
        // Start from the minimum value of the slider
        yearSlider.value = parseInt(yearSlider.min);
        updateMap(parseInt(yearSlider.value));
        // Advance the slider at a regular interval defined by PLAY_DELAY_MS
        playInterval = setInterval(() => {
          const currentYear = parseInt(yearSlider.value);
          const maxYear = parseInt(yearSlider.max);
          if (currentYear >= maxYear) {
            // Stop at the end of the range
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
        // Stop playback
        clearInterval(playInterval);
        isPlaying = false;
        playButton.classList.remove('playing');
        playButton.textContent = 'Play';
      }
    });

    // Reset button functionality
    resetButton.addEventListener('click', () => {
      // When resetting, stop playback if active
      if (isPlaying) {
        clearInterval(playInterval);
        isPlaying = false;
        playButton.classList.remove('playing');
        playButton.textContent = 'Play';
      }
      // Reset slider to its minimum value and update the map
      yearSlider.value = parseInt(yearSlider.min);
      updateMap(parseInt(yearSlider.value));
    });

    // Toggle edit mode on button click
    toggleEditBtn.addEventListener('click', () => {
      if (!editMode) {
        // If entering edit mode, prompt for the edit key
        const entered = prompt('Enter edit key:');
        if (entered === null) {
          return; // user cancelled prompt
        }
        if (entered !== EDIT_KEY) {
          alert('Incorrect key. You cannot enter edit mode.');
          return;
        }
        // Correct key: enable edit mode
        editMode = true;
        toggleEditBtn.textContent = 'Exit Edit Mode';
        visitControls.style.display = 'flex';
        visitListContainer.style.display = 'block';
        renderVisitList();
      } else {
        // Exit edit mode
        editMode = false;
        toggleEditBtn.textContent = 'Edit';
        visitControls.style.display = 'none';
        visitListContainer.style.display = 'none';
        // Cancel any edit in progress
        editingIndex = null;
        addVisitBtn.textContent = 'Add Visit';
        // Clear selection
        yearSelect.value = '';
        countrySelect.value = '';
      }
    });

    // Render the list of visits in the table body
    function renderVisitList() {
      // Clear existing rows
      visitListTableBody.innerHTML = '';
      // If there are no visits, show a placeholder row
      if (visits.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.textContent = 'No visits added yet.';
        tr.appendChild(td);
        visitListTableBody.appendChild(tr);
        return;
      }
      visits.forEach((record, index) => {
        const tr = document.createElement('tr');
        const yearTd = document.createElement('td');
        yearTd.textContent = record.year;
        const countryTd = document.createElement('td');
        countryTd.textContent = countryMap[record.country] || record.country;
        const actionsTd = document.createElement('td');
        // Edit button
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.classList.add('edit-btn');
        editBtn.addEventListener('click', () => {
          startEditVisit(index);
        });
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.classList.add('delete-btn');
        deleteBtn.addEventListener('click', () => {
          if (confirm('Are you sure you want to delete this visit?')) {
            deleteVisit(index);
          }
        });
        actionsTd.appendChild(editBtn);
        actionsTd.appendChild(deleteBtn);
        tr.appendChild(yearTd);
        tr.appendChild(countryTd);
        tr.appendChild(actionsTd);
        visitListTableBody.appendChild(tr);
      });
    }

    // Start editing a visit at the given index
    function startEditVisit(index) {
      if (index < 0 || index >= visits.length) return;
      editingIndex = index;
      const rec = visits[index];
      // Ensure the year option exists in the select; if not, add it
      let yearOption = Array.from(yearSelect.options).find(opt => parseInt(opt.value) === rec.year);
      if (!yearOption) {
        const opt = document.createElement('option');
        opt.value = rec.year;
        opt.textContent = rec.year;
        yearSelect.appendChild(opt);
      }
      yearSelect.value = rec.year;
      countrySelect.value = rec.country;
      addVisitBtn.textContent = 'Update Visit';
    }

    // Delete a visit at the given index
    function deleteVisit(index) {
      if (index < 0 || index >= visits.length) return;
      visits.splice(index, 1);
      // Persist changes
      saveVisitsToStorage();
      // Update slider range and map
      updateSliderRange();
      updateMap(parseInt(yearSlider.value));
      // Re-render list
      renderVisitList();
    }

    // Persist the visits array to localStorage
    function saveVisitsToStorage() {
      try {
        localStorage.setItem('visits', JSON.stringify(visits));
      } catch (e) {
        console.error('Error saving visits to localStorage:', e);
      }
    }

    // Load visits from localStorage at startup
    function loadVisitsFromStorage() {
      try {
        const data = localStorage.getItem('visits');
        if (data) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            // Clear current visits array and push parsed items
            visits.length = 0;
            parsed.forEach(item => {
              // Only push items with valid structure
              if (item && typeof item.year === 'number' && typeof item.country === 'string') {
                visits.push({ year: item.year, country: item.country });
              }
            });
          }
        }
      } catch (e) {
        console.error('Error loading visits from localStorage:', e);
      }
    }
  });
})();
