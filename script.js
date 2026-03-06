(function() {
  // --- CONFIGURATION ---
  const supabaseUrl = 'https://prxcpbiztxjxocefxfmh.supabase.co';
  const supabaseKey = 'sb_publishable_R6OuLGT_fKaEGLGcL-GZgg_tYeejLMe';
  const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

  const visits = [];
  const countryMap = {};
  let editMode = false;
  let editingIndex = null;
  let currentUser = null;

  // --- AMCHARTS VARIABLES ---
  let root, polygonSeries, defaultColor, visitedPastColor, visitedCurrentColor;

  window.addEventListener('load', async () => {
    // DOM Elements
    const yearSelect = document.getElementById('year-select');
    const countrySelect = document.getElementById('country-select');
    const addVisitBtn = document.getElementById('add-visit');
    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');
    const playButton = document.getElementById('play-button');
    const resetButton = document.getElementById('reset-button');
    const toggleEditBtn = document.getElementById('toggle-edit');
    
    // Auth Elements
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // --- AUTH LOGIC ---
    async function checkUser() {
      const { data: { user } } = await supabaseClient.auth.getUser();
      currentUser = user;
      if (user) {
        document.getElementById('logged-out-ui').style.display = 'none';
        document.getElementById('logged-in-ui').style.display = 'block';
        document.getElementById('user-display').textContent = user.email;
        loadVisits();
      } else {
        document.getElementById('logged-out-ui').style.display = 'block';
        document.getElementById('logged-in-ui').style.display = 'none';
        visits.length = 0;
        updateMap(parseInt(yearSlider.value));
      }
    }

    loginBtn.onclick = async () => {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) alert(error.message); else checkUser();
    };

    signupBtn.onclick = async () => {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) alert("Check your email for confirmation!"); else alert("Signup successful!");
    };

    logoutBtn.onclick = async () => {
      await supabaseClient.auth.signOut();
      location.reload();
    };

    // --- DATA LOGIC ---
    async function loadVisits() {
      const { data, error } = await supabaseClient
        .from('visits')
        .select('*')
        .order('year', { ascending: true });
      
      if (!error) {
        visits.length = 0;
        visits.push(...data);
        updateSliderRange();
        updateMap(parseInt(yearSlider.value));
        renderVisitList();
      }
    }

    addVisitBtn.onclick = async () => {
      const year = parseInt(yearSelect.value);
      const country = countrySelect.value;
      if (!year || !country) return alert("Select year and country");

      const { error } = await supabaseClient
        .from('visits')
        .insert([{ user_id: currentUser.id, year, country }]);
      
      if (error) alert(error.message); else loadVisits();
    };

    // --- MAP & UI LOGIC (RETAINED FROM ORIGINAL) ---
    function updateSliderRange() {
        yearSlider.min = 1980;
        yearSlider.max = 2030;
        if (visits.length > 0) {
            const years = visits.map(v => v.year);
            yearSlider.min = Math.min(...years) - 1;
            yearSlider.max = Math.max(...years) + 1;
        }
        yearLabel.textContent = yearSlider.value;
    }

    function updateMap(year) {
      yearLabel.textContent = year;
      const visitedPast = visits.filter(v => v.year < year).map(v => v.country);
      const visitedCurrent = visits.filter(v => v.year === year).map(v => v.country);

      if (polygonSeries) {
        polygonSeries.mapPolygons.each(p => p.set('fill', defaultColor));
        visitedPast.forEach(c => polygonSeries.getDataItemById(c)?.get('mapPolygon').set('fill', visitedPastColor));
        visitedCurrent.forEach(c => polygonSeries.getDataItemById(c)?.get('mapPolygon').set('fill', visitedCurrentColor));
      }
    }

    // Initialize Map
    am5.ready(() => {
      root = am5.Root.new("chartdiv");
      root.setThemes([am5themes_Animated.new(root)]);
      const chart = root.container.children.push(am5map.MapChart.new(root, { panX: "rotateX", projection: am5map.geoMercator() }));
      polygonSeries = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: am5geodata_worldIndiaLow }));
      
      defaultColor = am5.color(0xdedede);
      visitedPastColor = am5.color(0x666666);
      visitedCurrentColor = am5.color(0xff5722);

      // Populate selects
      const countries = am5geodata_worldIndiaLow.features.map(f => ({ id: f.id, name: f.properties.name }));
      countries.sort((a,b) => a.name.localeCompare(b.name)).forEach(c => {
        const opt = new Option(`${c.name} (${c.id})`, c.id);
        countrySelect.add(opt);
        countryMap[c.id] = c.name;
      });

      for(let y=1980; y<=2030; y++) yearSelect.add(new Option(y, y));
      
      checkUser();
    });

    // Slider/Play logic remains similar to original script.js
    yearSlider.oninput = () => updateMap(parseInt(yearSlider.value));
    
    toggleEditBtn.onclick = () => {
      editMode = !editMode;
      document.getElementById('visit-controls').style.display = editMode ? 'flex' : 'none';
      document.getElementById('visit-list-container').style.display = editMode ? 'block' : 'none';
    };
  });
})();