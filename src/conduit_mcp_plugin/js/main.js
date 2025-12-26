/**
 * Main entry point for the Conduit MCP Figma plugin UI.
 * Initializes and coordinates all UI modules.
 */

/**
 * Detects the current Figma UI theme (light or dark) by observing class changes
 * on the `document.documentElement` (e.g., 'figma-dark', 'figma-light').
 * It then applies a corresponding 'theme-dark' or 'theme-light' class to the
 * `document.body` to allow the plugin UI to match Figma's theme.
 * This function also sets up a MutationObserver to react to live theme changes
 * made by the user in Figma's settings.
 */
function setupThemeDetection() {
  /**
   * Handles theme changes by inspecting the class list of `document.documentElement`
   * to determine if Figma's dark theme is active. It then updates the `document.body`
   * by adding either 'theme-light' or 'theme-dark' class and removing the other,
   * ensuring the plugin's UI matches the Figma environment.
   * @returns {void}
   */
  function handleThemeChange() {
    const isDarkTheme = document.documentElement.classList.contains('figma-dark');
    const theme = isDarkTheme ? 'dark' : 'light';
    console.log(`Current Figma theme: ${theme}`);
    
    // Apply our theme class to body
    if (theme === 'light') {
      document.body.classList.add('theme-light');
      document.body.classList.remove('theme-dark');
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
    }
  }
  
  // Detect initial theme
  handleThemeChange();
  
  /**
   * The callback function for the MutationObserver. This function is executed
   * whenever an observed mutation occurs on `document.documentElement`.
   * It specifically checks if the `class` attribute was changed, which
   * indicates a potential Figma theme change, and if so, calls `handleThemeChange`
   * to update the plugin's theme accordingly.
   * @param {MutationRecord[]} mutations - An array of MutationRecord objects describing each change that occurred.
   * @returns {void}
   */
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        handleThemeChange();
      }
    });
  });
  
  // Start observing the HTML element for class changes
  observer.observe(document.documentElement, { attributes: true });
}

/**
 * Event listener for the 'DOMContentLoaded' event.
 * This function is executed once the initial HTML document has been completely loaded and parsed,
 * without waiting for stylesheets, images, and subframes to finish loading.
 * It serves as the main entry point for initializing the plugin's UI by calling:
 * - `initUIElements()`: To set up references to various UI elements.
 * - `initTabNavigation()`: To enable tabbed navigation within the plugin.
 * - `initMessageListener()`: To establish communication with the plugin's backend (main.ts).
 * - `setupThemeDetection()`: To detect and apply Figma's current theme to the plugin UI.
 * @listens DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize UI elements
  initUIElements();
  
  // Initialize tab navigation
  initTabNavigation();
  
  // Initialize message listener for plugin communication
  initMessageListener();
  
  // Setup theme detection using Figma's built-in theme classes
  setupThemeDetection();
  
  console.log('Conduit MCP Figma plugin UI initialized');
});
