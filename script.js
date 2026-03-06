(function() {
  // --- CONFIGURATION ---
  // Replace these with your actual Supabase credentials from Settings > API
  const supabaseUrl = 'https://prxcpbiztxjxocefxfmh.supabase.co';
  const supabaseKey = 'sb_publishable_R6OuLGT_fKaEGLGcL-GZgg_tYeejLMe';
  const supabase = supabase.createClient(supabaseUrl, supabaseKey);

  // App State
  const visits = [];
  const countryMap = {};
  let editMode = false;
  let currentUser = null;

  // amCharts Objects
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

    // --- AUTHENTICATION & SESSION GUARD ---
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      currentUser = user;

      const loggedOutUI = document.getElementById('logged-out-ui');
      const loggedInUI = document.getElementById('logged-in-ui');
      const mainAppContent = document.getElementById('main-app-content');

      if (user) {
        loggedOutUI.style.display = 'none';
        loggedInUI.style.display = 'block';
        mainAppContent.style.display = 'block';
        document.getElementById('user-display').textContent = `Logged in: ${user.email}`;
        loadVisits();
      } else {
        loggedOutUI.style.display = 'block';
        loggedInUI.style.display = 'none';
        mainAppContent.style.display = 'none';
        visits.length = 0;
        if (polygonSeries) updateMap(parseInt(yearSlider.value));
      }
    }

    // Sign Up logic with error feedback
    signupBtn.onclick = async () => {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const magicKey = document.getElementById('magic-key').value;

      if (!email || !password || !magicKey) {
        return alert("Please fill in all fields: Email, Password, and Magic Key.");
      }

      // Verify Key via RPC
      const { data: isValid, error: rpcError } = await supabase.rpc('verify_invitation', { 
        input_email: email, 
        input_key: magicKey 
      });

      if (rpcError) {
        console.error("RPC Error:", rpcError);
        return alert("System error verifying key. Please try again later.");
      }

      if (!isValid) {
        return alert("Invalid or expired Magic Key for this email. Please contact the admin.");
      }

      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      
      if (signUpError) {
        alert("Signup Failed: " + signUpError.message);
      } else {
        alert("Signup initiated! Please check your email to confirm your account.");
      }
    };

    // Login logic with error feedback
    loginBtn.onclick = async () => {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      
      if (!email || !password) return alert("Please enter both email and password.");

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        alert("Login Failed: " + error.message);
      } else {
        checkUser();
      }
    };

    logoutBtn.onclick = async () => {
      await supabase.auth.signOut();
      location.reload();
    };

    // --- CLOUD DATA LOGIC ---
    async function loadVisits() {
      const { data, error } = await supabase
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

      const { error } = await supabase
        .from('visits')
        .insert([{ user_id: currentUser.id, year, country }]);
      
      if (error) alert(error.message);
      else loadVisits();
    };

    // --- MAP RENDERING (Inherited Logic) ---
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
      const chart = root.container.children.push(am5map.MapChart.new(root, { 
        panX: "rotateX", 
        panY: "rotateY",
        projection: am5map.geoMercator() 
      }));
      
      // Use India-specific geodata
      polygonSeries = chart.series.push(am5map.MapPolygonSeries.new(root, { 
        geoJSON: am5geodata_worldIndiaLow 
      }));
      
      defaultColor = am5.color(0xdedede);
      visitedPastColor = am5.color(0x666666);
      visitedCurrentColor = am5.color(0xff5722);

      // Populate selects
      const countries = am5geodata_worldIndiaLow.features.map(f => ({ id: f.id, name: f.properties.name }));
      countries.sort((a,b) => a.name.localeCompare(b.name)).forEach(c => {
        countrySelect.add(new Option(`${c.name} (${c.id})`, c.id));
        countryMap[c.id] = c.name;
      });

      for(let y=1980; y<=2035; y++) yearSelect.add(new Option(y, y));
      
      checkUser();
    });

    // Control Listeners
    yearSlider.oninput = () => updateMap(parseInt(yearSlider.value));
    
    toggleEditBtn.onclick = () => {
      editMode = !editMode;
      document.getElementById('visit-controls').style.display = editMode ? 'flex' : 'none';
      document.getElementById('visit-list-container').style.display = editMode ? 'block' : 'none';
    };

    // Playback Logic
    let isPlaying = false;
    let playInterval = null;
    playButton.onclick = () => {
      if (!isPlaying) {
        isPlaying = true;
        playButton.textContent = 'Pause';
        playInterval = setInterval(() => {
          const nextYear = parseInt(yearSlider.value) + 1;
          if (nextYear > parseInt(yearSlider.max)) {
            clearInterval(playInterval);
            isPlaying = false;
            playButton.textContent = '▶';
          } else {
            yearSlider.value = nextYear;
            updateMap(nextYear);
          }
        }, 1500);
      } else {
        clearInterval(playInterval);
        isPlaying = false;
        playButton.textContent = '▶';
      }
    };

    resetButton.onclick = () => {
      yearSlider.value = yearSlider.min;
      updateMap(parseInt(yearSlider.min));
    };
  });

  // Render function for the table
  function renderVisitList() {
    const tbody = document.querySelector('#visit-list tbody');
    tbody.innerHTML = '';
    visits.forEach((v) => {
      const row = tbody.insertRow();
      row.insertCell(0).textContent = v.year;
      row.insertCell(1).textContent = countryMap[v.country] || v.country;
      const actions = row.insertCell(2);
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.onclick = async () => {
        if (confirm('Delete this visit?')) {
          await supabase.from('visits').delete().match({ id: v.id });
          location.reload(); // Simple refresh to update
        }
      };
      actions.appendChild(delBtn);
    });
  }
})();