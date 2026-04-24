/**
 * @file Tab Manager for the Conduit MCP Figma plugin UI.
 * @module TabManager
 * This script handles the tab switching functionality within the plugin's user interface.
 * It assumes a specific HTML structure where tab controls have a class `tab` and an ID
 * (e.g., `id="tab-connection"`), and their corresponding content panels have a class
 * `tab-content` and an ID that conventionally matches the tab's ID but is prefixed
 * with `content-` (e.g., `id="content-connection"`).
 *
 * Clicking a tab will add an 'active' class to it and its corresponding content panel,
 * while removing the 'active' class from all other tabs and content panels.
 */

/**
 * A NodeList of all HTML elements that serve as tab controls (e.g., buttons or divs).
 * These elements are expected to have the class `tab` and unique IDs.
 * This variable is populated by {@link initTabNavigation}.
 * @global
 * @type {NodeListOf<HTMLElement>|undefined}
 */
let tabs;

/**
 * A NodeList of all HTML elements that serve as content panels for the tabs.
 * These elements are expected to have the class `tab-content` and unique IDs
 * that correspond to their respective tab control IDs (e.g., `content-connection`
 * for `tab-connection`).
 * This variable is populated by {@link initTabNavigation}.
 * @global
 * @type {NodeListOf<HTMLElement>|undefined}
 */
let tabContents;


/**
 * Initializes the tab navigation functionality.
 * This function performs the following actions:
 * 1. Queries the DOM to find all elements with the class `tab` and stores them in the global `tabs` NodeList.
 * 2. Queries the DOM to find all elements with the class `tab-content` and stores them in the global `tabContents` NodeList.
 * 3. Attaches a click event listener to each tab element.
 *
 * When a tab is clicked, the event listener will:
 * - Remove the `active` CSS class from all tab elements and all tab content elements.
 * - Add the `active` CSS class to the clicked tab element.
 * - Construct the ID of the corresponding content panel (e.g., if tab ID is `tab-settings`, content ID is `content-settings`).
 * - Add the `active` CSS class to the identified content panel, making it visible.
 *
 * Assumed HTML Structure:
 * ```html
 * <button class="tab active" id="tab-connection">Connection</button>
 * <button class="tab" id="tab-settings">Settings</button>
 *
 * <div class="tab-content active" id="content-connection">...Connection panel content...</div>
 * <div class="tab-content" id="content-settings">...Settings panel content...</div>
 * ```
 * @returns {void}
 */
function initTabNavigation() {
  // Get all tab elements and content
  tabs = document.querySelectorAll(".tab");
  tabContents = document.querySelectorAll(".tab-content");
  
  // Add click event to tabs
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Remove active class from all tabs and contents
      tabs.forEach((t) => t.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      // Add active class to clicked tab
      tab.classList.add("active");
      
      // Show the corresponding content
      const contentId = "content-" + tab.id.split("-")[1];
      document.getElementById(contentId).classList.add("active");
    });
  });
}
