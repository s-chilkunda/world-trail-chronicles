# WorldTrail Chronicles

WorldTrail Chronicles is a self‑contained web app for logging and visualising the countries you’ve visited.  
It combines an interactive world map with a year slider so you can watch your travels unfold over time.  
Highlighted countries, a play button, random colours and an optional edit mode make it both informative and fun to use.

## Features

- **Interactive map and timeline** – Select any year to see which countries you visited.  The current year’s countries are shown in a random highlight colour while past visits fade to a darker grey for contrast.  A play button animates the slider through time so you can watch your travels grow.
- **Editable visit log** – A password‑protected *Edit* mode lets you add, modify or remove visits.  An “Add Visit” form includes a year drop‑down (1975 – 2035) and a country selector populated from amCharts’ world geodata.  You can also reset the year slider to its starting value or slow down the animation by adjusting a constant in the script.
- **Dynamic slider range** – The slider automatically adjusts its start and end years based on your data.  It extends two years before the earliest visit and two years after the latest visit so there’s always context at both ends of the timeline.  If there are no visits, it defaults to 1975–2035.
- **Persistent storage** – All visits are saved to `localStorage` so they persist between sessions.  You can also supply a `visits.json` file with initial data so that anyone who opens the site sees the same timeline you do.  When the page loads it will import the JSON, convert year strings to numbers, merge it into local storage and then update the slider range accordingly.

## Getting started

1. **Clone or download the repository.**  Unzip the project if necessary and make sure the files `index.html`, `style.css`, `script.js` and (optionally) `visits.json` stay in the same directory.
2. **Run it locally.**  Modern browsers prevent `fetch()` from loading local files when the page is opened via `file://` URLs.  To avoid CORS issues, serve the files over HTTP.  The simplest way is:

   ```sh
   cd world-trail-chronicles
   python3 -m http.server 8000
   ```

   Then visit `http://localhost:8000` in your browser.  The app loads the map, reads any stored visits from `localStorage` or `visits.json`, and calculates the slider range.
3. **Enter edit mode.**  Click the **Edit** button and enter your secret key (set in `script.js` as `EDIT_KEY`) to unlock the form and visit list.  Add new visits, change existing ones or delete entries as needed.  Changes are stored in your browser’s local storage.  Use the reset button to jump the slider back to the beginning or the play button to animate through the years.

## Sharing your timeline

Because data saved in `localStorage` is scoped to a single browser and not shared across incognito sessions or other devices, you’ll need to embed your visits into the code or a JSON file if you want others to see them.  To share your timeline:

1. Export your visits from the console with:

   ```js
   JSON.stringify(JSON.parse(localStorage.getItem('visits')), null, 2)
   ```

   Copy the resulting JSON array.
2. Save it into `visits.json` in your repository.  The JSON file can be either a top‑level array or an object with a `visits` property; `script.js` will handle either.  If you choose the object form, wrap your array like `{ "visits": [ … ] }`.
3. Commit the updated `visits.json` file and redeploy your site.  When new visitors load the page, it will import the visits from `visits.json`, save them to `localStorage` and display them immediately.

## Customising

- **Edit key** – Change the `EDIT_KEY` constant near the top of `script.js` to control who can enter edit mode.  This is a simple client‑side check; it only obscures the editing controls.  Real authentication would require a server.
- **Playback speed** – Adjust the `PLAY_DELAY_MS` constant in `script.js` to change how fast the slider moves during playback.  The default is 1500 ms (1.5 seconds) per step.
- **Timeline range** – The year drop‑down covers 1980–2030 by default.  To change this range, modify the `populateYearSelect()` function in `script.js`.  The slider’s dynamic range logic will still extend two years beyond the earliest and latest visits.
- **Colour scheme** – Colours for highlighted countries and visited past years are defined in `script.js`.  The current year uses a random colour while past years use a dark grey; adjust these values in the `updateMap()` function to suit your taste.
