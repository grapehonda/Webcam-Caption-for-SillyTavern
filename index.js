// The main script for the extension
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// Keep track of where your extension is located
const extensionName = "auto_webcam_caption";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
  enabled: true,
  hintTemplate: "*Observe and incorporate this into your response naturally, as if you see it in the room: \n{{caption}}*",
  manualMessage: "look at this",
  faceRecognitionEnabled: true,  // New default: face check on
  captionPrompt: ""  // New: blank by default, for custom caption prompt
, frequency: 1  // New: 1 = every message, N = every Nth
, promptName: 'Default'  // New: default selected prompt name
, detThreshold: 0.5  // NEW: global face detection threshold
};

// Message counter (reset on chat load or manually if needed)
let messageCount = 0;

// Loads the extension settings if they exist, otherwise initializes them to the defaults.
async function loadSettings() {
  // Create the settings if they don't exist
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  // Updating settings in the UI
  $("#webcam_enabled").prop("checked", extension_settings[extensionName].enabled).trigger("input");
  $("#webcam_hint_template").val(extension_settings[extensionName].hintTemplate).trigger("input");
  $("#webcam_manual_message").val(extension_settings[extensionName].manualMessage).trigger("input");
  $("#webcam_face_recognition_enabled").prop("checked", extension_settings[extensionName].faceRecognitionEnabled).trigger("input");
  $("#webcam_caption_prompt").val(extension_settings[extensionName].captionPrompt).trigger("input");  // New
  $("#webcam_frequency").val(extension_settings[extensionName].frequency).trigger("input");  // New - trigger to update span
  updateFrequencyValue(extension_settings[extensionName].frequency);  // Initial update
  // NEW: Load det threshold
  $("#webcam_det_threshold").val(extension_settings[extensionName].detThreshold).trigger("input");
  updateDetThresholdValue(extension_settings[extensionName].detThreshold);  // NEW: initial update
}

// Function to update slider value text and CSS fill
function updateFrequencyValue(val) {
  const slider = document.getElementById('webcam_frequency');
  const valueSpan = document.getElementById('webcam_frequency_value');
  if (slider && valueSpan) {
    const percent = ((val - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--value', percent + '%');
    valueSpan.textContent = `Every ${val} message${val > 1 ? 's' : ''}`;
  }
}

// NEW: Function to update det threshold slider value text and CSS fill
function updateDetThresholdValue(val) {
  const slider = document.getElementById('webcam_det_threshold');
  const valueSpan = document.getElementById('webcam_det_threshold_value');
  if (slider && valueSpan) {
    const percent = ((val - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--value', percent + '%');
    valueSpan.textContent = val.toFixed(2);
  }
}

// This function is called when the extension settings are changed in the UI
function onEnabledInput(event) {
  extension_settings[extensionName].enabled = Boolean($(event.target).prop("checked"));
  updateToggleButton();
  saveSettingsDebounced();
}

function onHintTemplateInput(event) {
  extension_settings[extensionName].hintTemplate = $(event.target).val();
  saveSettingsDebounced();
}

function onManualMessageInput(event) {
  extension_settings[extensionName].manualMessage = $(event.target).val();
  saveSettingsDebounced();
}

function onFaceRecognitionEnabledInput(event) {
  extension_settings[extensionName].faceRecognitionEnabled = Boolean($(event.target).prop("checked"));
  saveSettingsDebounced();
}

function onCaptionPromptInput(event) {  // New
  extension_settings[extensionName].captionPrompt = $(event.target).val();
  saveSettingsDebounced();
}

function onFrequencyInput(event) {
  let val = parseInt($(event.target).val());
  if (isNaN(val) || val < 1) val = 1;  // Fallback to 1 if invalid
  extension_settings[extensionName].frequency = val;
  updateFrequencyValue(val);  // Update text and fill
  saveSettingsDebounced();
}

// NEW: Handler for det threshold input
function onDetThresholdInput(event) {
  let val = parseFloat($(event.target).val());
  if (isNaN(val) || val < 0.1) val = 0.1;
  if (val > 0.9) val = 0.9;
  extension_settings[extensionName].detThreshold = val;
  updateDetThresholdValue(val);
  saveSettingsDebounced();
  // Send to server
  fetch('http://127.0.0.1:5000/update_det_threshold', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({threshold: val})
  }).catch(error => console.error('Error updating det threshold:', error));
}

// Update the toggle button state based on settings
function updateToggleButton() {
  const button = document.getElementById('webcam-toggle-btn');
  if (button) {
    button.style.backgroundColor = extension_settings[extensionName].enabled ? '#4CAF50' : '#f44336';
    button.innerHTML = '<i class="fa fa-video-camera" style="margin-right: 5px;"></i>' + (extension_settings[extensionName].enabled ? 'ON' : 'OFF');
  }
}

const MODULE_NAME = 'auto_webcam_caption';
const FLASK_ENDPOINT = 'http://127.0.0.1:5000/v1/chat/completions';

let previousCaption = '';

globalThis.injectWebcamCaption = async function (chat, contextSize, abort, type) {
  const manualMessage = extension_settings[extensionName].manualMessage.toLowerCase();
  const lastIndex = chat.length - 1;
  const lastMes = chat[lastIndex]?.mes?.toLowerCase() || '';
  const isManual = lastMes.includes(manualMessage);

  // NEW: Allow manual override even if enabled is false
  if (!extension_settings[extensionName].enabled && !isManual) {
    console.log(`[${MODULE_NAME}] Extension disabled - skipping`);
    return;
  }

  messageCount++;  // Increment counter

  const frequency = extension_settings[extensionName].frequency;
  if (!isManual && frequency > 1 && messageCount % frequency !== 0) {
    console.log(`[${MODULE_NAME}] Skipping caption (frequency: every ${frequency} messages, current: ${messageCount})`);
    return;
  }

  console.log(`[${MODULE_NAME}] Interceptor triggered - starting fetch (message ${messageCount})`);

  // NEW: Check for webcam before proceeding
  if (!(await checkWebcam())) {
    console.log('[auto_webcam_caption] No webcam detected - skipping caption');
    return;
  }

  let latestCaption = '';
  try {
    const response = await fetch(FLASK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enable_face_check: extension_settings[extensionName].faceRecognitionEnabled,
        caption_prompt: extension_settings[extensionName].captionPrompt
      }),
      signal: abort.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    latestCaption = data.choices[0].message.content.trim();

    // If caption is error or empty, skip
    if (latestCaption.startsWith('Error') || latestCaption === '') {
      console.log(`[${MODULE_NAME}] Invalid caption - skipping`);
      return;
    }

    // Dedup: Skip if identical to previous
    if (latestCaption === previousCaption) {
      console.log(`[${MODULE_NAME}] Duplicate caption - skipping`);
      return;
    }
    previousCaption = latestCaption;

    // Hint template (random if multi-line)
    let hintTemplates = extension_settings[extensionName].hintTemplate.split('\n').filter(line => line.trim() !== '');
    if (hintTemplates.length === 0) hintTemplates = [defaultSettings.hintTemplate];
    const hint = hintTemplates[Math.floor(Math.random() * hintTemplates.length)].replace('{{caption}}', latestCaption);

    // Append to last message (invisible)
    chat[lastIndex].mes += `\n\n${hint}`;
    chat[lastIndex].extra = chat[lastIndex].extra || {};
    chat[lastIndex].extra.isSmallSys = true;  // Hide in UI

    console.log(`[${MODULE_NAME}] Caption appended: ${latestCaption}`);
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(`[${MODULE_NAME}] Fetch error:`, error);
    }
  }
};

// Hotkey toggle (Alt + W)
document.addEventListener('keydown', (event) => {
  if (event.altKey && event.key.toLowerCase() === 'w') {
    event.preventDefault();
    extension_settings[extensionName].enabled = !extension_settings[extensionName].enabled;
    updateToggleButton();
    saveSettingsDebounced();
    console.log(`[${MODULE_NAME}] Toggled via hotkey: ${extension_settings[extensionName].enabled ? 'Enabled' : 'Disabled'}`);
  }
});

// Add both sacred buttons (toggle and Look) with poll (DON'T FUCKING REMOVE!)
function addToggleButton() {
  const interval = setInterval(() => {
    const inputBar = document.querySelector('#send_form');
    if (inputBar && !document.getElementById('webcam-toggle-btn')) {
      console.log('[auto_webcam_caption] Adding buttons to send_form');

      const button = document.createElement('button');
      button.id = 'webcam-toggle-btn';
      button.style.padding = '5px 10px';
      button.style.margin = '0 5px';
      button.style.backgroundColor = extension_settings[extensionName].enabled ? '#4CAF50' : '#f44336';
      button.style.color = 'white';
      button.style.border = 'none';
      button.style.borderRadius = '4px';
      button.style.cursor = 'pointer';
      button.style.fontSize = '0.9em';  // Slightly smaller text for compactness
      button.innerHTML = '<i class="fa fa-video-camera" style="margin-right: 5px;"></i>' + (extension_settings[extensionName].enabled ? 'ON' : 'OFF');  // Add camera icon
      button.title = 'Toggle Auto Webcam Caption (Alt + W)';

      button.addEventListener('click', () => {
        extension_settings[extensionName].enabled = !extension_settings[extensionName].enabled;
        updateToggleButton();
        saveSettingsDebounced();
        console.log(`[${MODULE_NAME}] Toggled via button: ${extension_settings[extensionName].enabled ? 'Enabled' : 'Disabled'}`);
      });

      const lookButton = document.createElement('button');
      lookButton.id = 'webcam-look-btn';
      lookButton.style.padding = '5px 10px';
      lookButton.style.margin = '0 5px';
      lookButton.style.backgroundColor = '#2196F3';
      lookButton.style.color = 'white';
      lookButton.style.border = 'none';
      lookButton.style.borderRadius = '4px';
      lookButton.style.cursor = 'pointer';
      lookButton.style.fontSize = '0.9em';
      lookButton.innerHTML = '<i class="fa fa-eye" style="margin-right: 5px;"></i>Look';
      lookButton.title = 'Trigger manual caption (even if auto is OFF)';

      lookButton.addEventListener('click', () => {
        const userInput = document.getElementById('send_textarea');  // Updated to your ST input ID
        if (userInput) {
          if (userInput.value.trim() !== '') {
            userInput.value += ' ';
          }
          userInput.value += extension_settings[extensionName].manualMessage;
          // Auto-send the message
          const sendButton = document.getElementById('send_but');
          if (sendButton) {
            sendButton.click();
          } else {
            console.error('[auto_webcam_caption] Send button not found - message pasted but not sent');
          }
        }
      });

      // Insert sacred toggle and look button at the beginning
      inputBar.insertBefore(button, inputBar.firstChild);
      inputBar.insertBefore(lookButton, inputBar.firstChild.nextSibling);

      clearInterval(interval);
    }
  }, 500);  // Check every 500ms until input bar exists
}
  // Add sacred on/off & look buttons (DON'T FUCKING REMOVE!!!)
  addToggleButton();

// NEW: Webcam availability check function
async function checkWebcam() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === 'videoinput');
  } catch (err) {
    console.error('[auto_webcam_caption] Webcam check error:', err);
    return false;
  }
}

// This function is called when the extension is loaded
jQuery(async () => {
  // Load settings HTML
  const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
  $("#extensions_settings").append(settingsHtml);

  // Listen for settings changes
  // ORIGINAL LINE (comment out and remove): $("#webcam_enabled").on("input", onEnabledInput);
  // NEW: The line above is already there, no change needed
  $("#webcam_hint_template").on("input", onHintTemplateInput);
  $("#webcam_manual_message").on("input", onManualMessageInput);
  $("#webcam_face_recognition_enabled").on("input", onFaceRecognitionEnabledInput);
  $("#webcam_caption_prompt").on("input", onCaptionPromptInput);
  $("#webcam_frequency").on("input", onFrequencyInput);
  // NEW: Bind det threshold input event
  $('#webcam_det_threshold').on('input', onDetThresholdInput);

  // Load settings when starting things up
  await loadSettings();

  // Prompt descriptions for hover
  const promptDescriptions = {
      "Default": "Basic first-person description with factual bullets.",
      "Roleplay Depth": "Adds roleplay flair for immersive storytelling.",
      "Stranger Mode": "Third-person for unfamiliar people or groups."
      // Add more from brainstorm as needed
  };

  // Load prompts list
  async function refreshPromptList() {
      console.log('[auto_webcam_caption] Refreshing prompt list');
      try {
          const response = await fetch('http://127.0.0.1:5000/list_prompts');
          console.log('[auto_webcam_caption] Fetch response status:', response.status);
          if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
          }
          const prompts = await response.json();
          console.log('[auto_webcam_caption] Fetched prompts:', prompts);
          const select = document.getElementById('webcam_prompt_variant');
          select.innerHTML = '';
          for (const name in prompts) {
              const option = document.createElement('option');
              option.value = name;
              option.textContent = name;
              option.title = promptDescriptions[name] || 'Custom prompt - no description';
              select.appendChild(option);
          }
          // Load selected into textarea
          select.value = extension_settings[extensionName].promptName || 'Default';
          $('#webcam_caption_prompt').val(prompts[select.value]);
      } catch (error) {
          console.error('[auto_webcam_caption] Error loading prompts:', error);
      }
  }

  // Save prompt
  document.getElementById('webcam_save_prompt').addEventListener('click', async () => {
      console.log('[auto_webcam_caption] Save prompt button clicked');
      const name = document.getElementById('webcam_prompt_name').value.trim();
      const prompt = document.getElementById('webcam_caption_prompt').value.trim();
      if (!name || !prompt) {
          alert('Need name and prompt');
          return;
      }
      try {
          const response = await fetch('http://127.0.0.1:5000/save_prompt', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({name, prompt})
          });
          console.log('[auto_webcam_caption] Fetch response status:', response.status);
          const data = await response.json();
          if (data.status === 'success') {
              alert(data.message);
              document.getElementById('webcam_prompt_name').value = '';
              refreshPromptList();
          } else {
              alert('Error: ' + data.message);
          }
      } catch (error) {
          alert('Error saving prompt: ' + error);
          console.error('[auto_webcam_caption] Save fetch error:', error);
      }
  });

  // On dropdown change, load prompt
  document.getElementById('webcam_prompt_variant').addEventListener('change', (event) => {
      console.log('[auto_webcam_caption] Prompt variant changed to:', event.target.value);
      extension_settings[extensionName].promptName = event.target.value;
      saveSettingsDebounced();
      fetch('http://127.0.0.1:5000/list_prompts')
          .then(response => response.json())
          .then(prompts => {
              $('#webcam_caption_prompt').val(prompts[event.target.value]);
          });
  });

  // Initial refresh for prompts
  refreshPromptList();

  // Repurpose upload_section to add person row (merged one button)
  const uploadSection = document.getElementById('upload_section');
  if (uploadSection) {
    uploadSection.innerHTML = '<label style="margin-right: 10px;">Add person:</label>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Name';
    nameInput.style = 'padding: 5px; margin-right: 10px;';

    const uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.multiple = true;
    uploadInput.accept = 'image/jpeg, image/png';
    uploadInput.style.display = 'none';

    const uploadGenerateButton = document.createElement('button');
    uploadGenerateButton.textContent = 'Upload & Generate';
    uploadGenerateButton.style = 'padding: 5px 10px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em;';
    uploadGenerateButton.addEventListener('click', () => {
      if (!nameInput.value.trim()) {
        alert('Enter a name first');
        return;
      }
      uploadInput.click();
    });

    uploadInput.addEventListener('change', async () => {
      const name = nameInput.value.trim();
      if (!name || uploadInput.files.length === 0) {
        alert('Need name and photos');
        return;
      }
      const formData = new FormData();
      for (const file of uploadInput.files) {
        formData.append('photos', file);
      }
      formData.append('name', name);
      try {
        const response = await fetch('http://127.0.0.1:5000/add_person', { method: 'POST', body: formData });
        const data = await response.json();
        if (data.status === 'success') {
          alert(data.message);
          nameInput.value = '';
          uploadInput.value = '';
          refreshKnownList();
        } else {
          alert('Error: ' + data.message);
        }
      } catch (error) {
        alert('Error adding person: ' + error);
      }
    });

    uploadSection.appendChild(nameInput);
    uploadSection.appendChild(uploadGenerateButton);
    uploadSection.appendChild(uploadInput);
  }

  // Remove regen_section (merged into add)
  const regenSection = document.getElementById('regen_section');
  if (regenSection) {
    regenSection.remove();
  }

  // Add known faces list container after upload_section
  const knownListContainer = document.createElement('div');
  knownListContainer.id = 'known_faces_list';
  knownListContainer.style.marginTop = '10px';
  uploadSection.parentNode.insertBefore(knownListContainer, uploadSection.nextSibling);

  // Function to refresh list
  async function refreshKnownList() {
    try {
      const response = await fetch('http://127.0.0.1:5000/list_known');
      const people = await response.json();
      const container = document.getElementById('known_faces_list');
      container.innerHTML = '<label>Known people:</label>';
      people.forEach(person => {
        const row = document.createElement('div');
        row.className = 'auto_webcam_caption_block flex-container';
        row.style.marginBottom = '5px';

        const nameLabel = document.createElement('span');
        nameLabel.textContent = person.name;
        nameLabel.style.marginRight = '10px';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = 0.3;
        slider.max = 0.8;
        slider.step = 0.01;
        slider.value = person.threshold;
        slider.style.width = '150px';
        slider.addEventListener('input', async () => {
          valueSpan.textContent = slider.value;
          await fetch('http://127.0.0.1:5000/update_threshold', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: person.name, threshold: slider.value})
          });
        });

        const valueSpan = document.createElement('span');
        valueSpan.textContent = person.threshold;
        valueSpan.style.marginLeft = '10px';

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'X';
        deleteBtn.style = 'padding: 2px 5px; background-color: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px;';
        deleteBtn.addEventListener('click', async () => {
          await fetch('http://127.0.0.1:5000/delete_person', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: person.name})
          });
          refreshKnownList();
        });

        row.appendChild(nameLabel);
        row.appendChild(slider);
        row.appendChild(valueSpan);
        row.appendChild(deleteBtn);
        container.appendChild(row);
      });
      if (people.length === 0) {
        container.innerHTML += '<p>None added yet.</p>';
      }
    } catch (error) {
      console.error('Error loading known faces:', error);
    }
  }

  // Initial refresh
  refreshKnownList();

  // Add Webcam Preview button and video
  const previewContainer = document.createElement('div');
  previewContainer.className = 'auto_webcam_caption_block flex-container';
  previewContainer.style.flexDirection = 'row';
  previewContainer.style.alignItems = 'center';
  previewContainer.style.marginTop = '10px';
  const previewButton = document.createElement('button');
  previewButton.textContent = 'Preview Webcam';
  previewButton.style.padding = '5px 10px';
  previewButton.style.backgroundColor = '#2196F3';
  previewButton.style.color = 'white';
  previewButton.style.border = 'none';
  previewButton.style.borderRadius = '4px';
  previewButton.style.cursor = 'pointer';
  previewButton.style.fontSize = '0.9em';
  previewContainer.appendChild(previewButton);

  let videoStream = null;
  const videoElement = document.createElement('video');
  videoElement.style.width = '320px';
  videoElement.style.height = '240px';
  videoElement.style.display = 'none';  // Hidden until preview starts
  videoElement.autoplay = true;
  videoElement.muted = true;
  previewContainer.appendChild(videoElement);

  previewButton.addEventListener('click', async () => {
    if (videoStream) {
      // Stop preview
      videoStream.getTracks().forEach(track => track.stop());
      videoStream = null;
      videoElement.style.display = 'none';
      previewButton.textContent = 'Preview Webcam';
      console.log('[auto_webcam_caption] Webcam preview stopped');
    } else {
      // NEW: Check for webcam
      if (!(await checkWebcam())) {
        alert('No webcam detected. Please connect one and try again.');
        return;
      }
      // Start preview
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        videoElement.srcObject = videoStream;
        videoElement.style.display = 'block';
        previewButton.textContent = 'Stop Preview';
        console.log('[auto_webcam_caption] Webcam preview started');
      } catch (error) {
        alert('Error accessing webcam: ' + error.message);
        console.error('[auto_webcam_caption] Webcam access error:', error);
      }
    }
  });

  // Insert preview container after known list
  if (uploadSection) {
    uploadSection.parentNode.insertBefore(previewContainer, uploadSection.nextSibling.nextSibling);
  }
});
