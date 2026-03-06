(function() {
  // Configuration
  const supabaseUrl = 'https://prxcpbiztxjxocefxfmh.supabase.co';
  const supabaseKey = 'sb_publishable_R6OuLGT_fKaEGLGcL-GZgg_tYeejLMe';
  let db; // We will assign the Supabase client here

  const visits = [];
  const countryMap = {};
  let editMode = false;
  let currentUser = null;
  let refreshVisits = async () => {};
  let root, polygonSeries, defaultColor, visitedPastColor, visitedCurrentColor;
  let isPlaying = false;
  let playInterval = null;

  function showAuthError(message) {
    const authError = document.getElementById('auth-error');
    if (authError) {
      authError.textContent = message;
      authError.style.display = 'block';
    } else {
      alert(message);
    }
  }

  function clearAuthError() {
    const authError = document.getElementById('auth-error');
    if (authError) {
      authError.textContent = '';
      authError.style.display = 'none';
    }
  }

  function showAccountError(message) {
    const accountError = document.getElementById('account-error');
    if (accountError) {
      accountError.textContent = message;
      accountError.style.display = 'block';
    }
    // Keep alert for critical destructive-action failures.
    alert(message);
  }

  function clearAccountError() {
    const accountError = document.getElementById('account-error');
    if (accountError) {
      accountError.textContent = '';
      accountError.style.display = 'none';
    }
  }

  function parseInvitationValidationResult(data) {
    if (typeof data === 'boolean') return data;
    if (Array.isArray(data) && data.length > 0) return parseInvitationValidationResult(data[0]);
    if (data && typeof data === 'object') {
      if (typeof data.is_valid === 'boolean') return data.is_valid;
      if (typeof data.valid === 'boolean') return data.valid;
      if (typeof data.result === 'boolean') return data.result;
    }
    return false;
  }

  function confirmDestructiveAction(promptText, verificationText) {
    const firstCheck = confirm(promptText);
    if (!firstCheck) return false;

    const typed = prompt(`Type "${verificationText}" to confirm.`);
    if (typed == null) return false;
    return typed.trim().toLowerCase() === String(verificationText).trim().toLowerCase();
  }

  window.addEventListener('load', async () => {
    // 1. Initialize Supabase Client safely
    if (typeof supabase === 'undefined') {
      console.error("Supabase library not loaded!");
      showAuthError("System error: Database connection failed.");
      return;
    }
    if (supabaseUrl.includes('YOUR_PROJECT_ID') || supabaseKey.includes('YOUR_ANON_KEY')) {
      showAuthError("Login is not configured. Update Supabase URL and anon key in script.js.");
      return;
    }
    db = supabase.createClient(supabaseUrl, supabaseKey);

    // 2. Map Elements
    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');
    const playButton = document.getElementById('play-button');
    const resetButton = document.getElementById('reset-button');

    // --- AUTH LOGIC ---
    async function checkUser() {
      const { data: { user } } = await db.auth.getUser();
      currentUser = user;

      const mainApp = document.getElementById('main-app-content');
      const loggedOut = document.getElementById('logged-out-ui');
      const loggedIn = document.getElementById('logged-in-ui');

      if (user) {
        mainApp.style.display = 'block';
        loggedOut.style.display = 'none';
        loggedIn.style.display = 'block';
        clearAccountError();
        document.getElementById('user-display').textContent = `User: ${user.email}`;
        loadVisits();
      } else {
        mainApp.style.display = 'none';
        loggedOut.style.display = 'block';
        loggedIn.style.display = 'none';
      }
    }

    document.getElementById('login-btn').onclick = async () => {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      
      console.log("Login attempt...");
      clearAuthError();
      if (!email || !password) {
        showAuthError("Please enter both email and password.");
        return;
      }

      try {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) {
          console.error(error);
          showAuthError("Login failed: " + error.message);
          return;
        }

        console.log("Login success!");
        checkUser();
      } catch (error) {
        console.error("Unexpected login error:", error);
        const message = error && error.message ? error.message : "Unknown login error";
        showAuthError("Login failed: " + message);
      }
    };

    document.getElementById('signup-btn').onclick = async () => {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const magicKey = document.getElementById('magic-key').value;
      clearAuthError();

      if (!email || !password || !magicKey) {
        showAuthError("Please enter email, password, and magic key.");
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const normalizedKey = magicKey.trim();

      try {
        // Try common RPC parameter names to support different SQL function signatures.
        let rpcResponse = await db.rpc('verify_invitation', {
          input_email: normalizedEmail, input_key: normalizedKey
        });

        if (rpcResponse.error && /function.*verify_invitation/i.test(rpcResponse.error.message || '')) {
          rpcResponse = await db.rpc('verify_invitation', {
            email: normalizedEmail, key: normalizedKey
          });
        }

        if (rpcResponse.error) {
          showAuthError("Magic key verification failed: " + rpcResponse.error.message);
          return;
        }

        const isValid = parseInvitationValidationResult(rpcResponse.data);
        if (!isValid) {
          showAuthError("Invalid Magic Key.");
          return;
        }

        const { error: signUpError } = await db.auth.signUp({ email: normalizedEmail, password });
        if (signUpError) showAuthError("Signup failed: " + signUpError.message);
        else {
          clearAuthError();
          alert("Signup successful! Check email or log in.");
        }
      } catch (error) {
        const message = error && error.message ? error.message : "Unknown signup error";
        showAuthError("Signup failed: " + message);
      }
    };

    document.getElementById('logout-btn').onclick = async () => {
      await db.auth.signOut();
      location.reload();
    };

    document.getElementById('delete-account-btn').onclick = async () => {
      if (!currentUser) {
        showAccountError("No logged-in user found.");
        return;
      }

      clearAuthError();
      clearAccountError();
      const verified = confirmDestructiveAction(
        "This will permanently delete your account and all visits. This cannot be undone.",
        currentUser.email
      );
      if (!verified) {
        showAccountError("Account deletion cancelled.");
        return;
      }

      try {
        const { data: { session }, error: sessionError } = await db.auth.getSession();
        if (sessionError || !session?.access_token) {
          showAccountError("Could not get user session for account deletion.");
          return;
        }

        const { error: invokeError } = await db.functions.invoke('delete-account', {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (invokeError) {
          showAccountError("Account deletion failed: " + invokeError.message);
          return;
        }

        await db.auth.signOut();
        alert("Account deleted.");
        location.reload();
      } catch (error) {
        const message = error && error.message ? error.message : "Unknown account deletion error";
        showAccountError("Account deletion failed: " + message);
      }
    };

    // --- DATA LOGIC ---
    async function loadVisits() {
      const { data, error } = await db.from('visits').select('*').order('year');
      if (!error) {
        visits.length = 0;
        visits.push(...data);
        updateSliderRange();
        updateMap(parseInt(yearSlider.value));
        renderVisitList();
      }
    }
    refreshVisits = loadVisits;

    document.getElementById('add-visit').onclick = async () => {
      const year = parseInt(document.getElementById('year-select').value);
      const country = document.getElementById('country-select').value;
      const { error } = await db.from('visits').insert([{ user_id: currentUser.id, year, country }]);
      if (error) alert(error.message); else loadVisits();
    };

    // --- MAP LOGIC ---
    function updateSliderRange() {
      yearSlider.min = 1980; yearSlider.max = 2035;
      if (visits.length > 0) {
        const years = visits.map(v => v.year);
        yearSlider.min = Math.min(...years) - 1;
        yearSlider.max = Math.max(...years) + 1;
      }
      yearSlider.value = yearSlider.min;
      yearLabel.textContent = yearSlider.value;
    }

    function updateMap(year) {
      yearLabel.textContent = year;
      const past = visits.filter(v => v.year < year).map(v => v.country);
      const current = visits.filter(v => v.year === year).map(v => v.country);
      if (polygonSeries) {
        polygonSeries.mapPolygons.each(p => p.set('fill', defaultColor));
        past.forEach(c => polygonSeries.getDataItemById(c)?.get('mapPolygon').set('fill', visitedPastColor));
        current.forEach(c => polygonSeries.getDataItemById(c)?.get('mapPolygon').set('fill', visitedCurrentColor));
      }
    }

    function stopPlayback() {
      if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
      }
      isPlaying = false;
      playButton.textContent = '▶';
    }

    am5.ready(() => {
      root = am5.Root.new("chartdiv");
      root.setThemes([am5themes_Animated.new(root)]);
      const chart = root.container.children.push(am5map.MapChart.new(root, { panX: "rotateX", projection: am5map.geoMercator() }));
      polygonSeries = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: am5geodata_worldIndiaLow }));
      defaultColor = am5.color(0xdedede); visitedPastColor = am5.color(0x666666); visitedCurrentColor = am5.color(0xff5722);
      
      am5geodata_worldIndiaLow.features.forEach(f => {
        document.getElementById('country-select').add(new Option(f.properties.name, f.id));
        countryMap[f.id] = f.properties.name;
      });
      for(let y=1980; y<=2035; y++) document.getElementById('year-select').add(new Option(y, y));
      checkUser();
    });

    yearSlider.oninput = () => updateMap(parseInt(yearSlider.value));
    playButton.onclick = () => {
      if (isPlaying) {
        stopPlayback();
        return;
      }

      isPlaying = true;
      playButton.textContent = 'Pause';
      playInterval = setInterval(() => {
        const currentYear = parseInt(yearSlider.value);
        const maxYear = parseInt(yearSlider.max);
        if (currentYear >= maxYear) {
          stopPlayback();
          return;
        }

        const nextYear = currentYear + 1;
        yearSlider.value = String(nextYear);
        updateMap(nextYear);
      }, 1000);
    };

    resetButton.onclick = () => {
      stopPlayback();
      yearSlider.value = yearSlider.min;
      updateMap(parseInt(yearSlider.value));
    };

    document.getElementById('toggle-edit').onclick = () => {
      editMode = !editMode;
      document.getElementById('visit-controls').style.display = editMode ? 'flex' : 'none';
      document.getElementById('visit-list-container').style.display = editMode ? 'block' : 'none';
    };
  });

  function renderVisitList() {
    const tbody = document.querySelector('#visit-list tbody');
    tbody.innerHTML = '';
    visits.forEach(v => {
      const row = tbody.insertRow();
      row.insertCell(0).textContent = v.year;
      row.insertCell(1).textContent = countryMap[v.country] || v.country;
      const btn = document.createElement('button');
      btn.textContent = 'Delete';
      btn.onclick = async () => {
        const verified = confirmDestructiveAction("Delete this visit?", "DELETE");
        if (!verified) return;
        await db.from('visits').delete().eq('id', v.id);
        await refreshVisits();
      };
      row.insertCell(2).appendChild(btn);
    });
  }
})();
