document.addEventListener('DOMContentLoaded', () => {
    const predictionForm = document.getElementById('predictionForm');
    const resultContainer = document.getElementById('resultContainer');
    const initialState = resultContainer.querySelector('.initial-state');
    const loaderWrapper = resultContainer.querySelector('.loader-wrapper');
    const predictionContent = resultContainer.querySelector('.prediction-content');
    const heatmapContainer = document.getElementById('heatmapContainer');
    const locationInput = document.getElementById('location');
    const destinationInput = document.getElementById('destination');
    const predictBtn = document.getElementById('predictBtn');
    const saveRouteBtn = document.getElementById('saveRouteBtn');
    const historyList = document.getElementById('historyList');
    const favoritesList = document.getElementById('favoritesList');
    const citySelector = document.getElementById('citySelector');
    const apiLabel = document.getElementById('apiLabel');
    const emergencyToggle = document.getElementById('emergencyToggle');
    const demoToggle = document.getElementById('demoToggle');
    const voiceToggle = document.getElementById('voiceToggle');

    let trafficChart;
    let map;
    let routingControl;
    let startMarker;
    let endMarker;
    let currentZones = [];
    let isEmergencyMode = false;
    let isDemoMode = false;
    let isVoiceEnabled = true;
    let userHasSubmittedPrediction = false; // Track user interaction

    // Voice Assistant Logic
    const speak = (text) => {
        if (!isVoiceEnabled) return;
        
        // ✅ Enhanced reliability with voice loading
        const loadVoicesAndSpeak = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) {
                // Voices not loaded yet, wait and retry
                setTimeout(() => loadVoicesAndSpeak(), 100);
                return;
            }
            
            window.speechSynthesis.cancel(); // Stop previous speech
            
            const speech = new SpeechSynthesisUtterance(text);
            speech.rate = 1;
            speech.pitch = 1;
            speech.volume = 1;
            
            // Prefer English voices that sound natural
            const preferredVoice = voices.find(v => v.lang.includes('en-US') || v.lang.includes('en-GB')) || voices[0];
            speech.voice = preferredVoice;
            
            // ✅ Add error handling
            speech.onerror = (event) => {
                console.warn('Speech synthesis error:', event.error);
            };
            
            speech.onend = () => {
                console.log('Speech completed');
            };
            
            window.speechSynthesis.speak(speech);
        };
        
        loadVoicesAndSpeak();
    };

    // ✅ Ensure voices are loaded when page loads
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
            console.log('Speech voices loaded');
        };
    }

    voiceToggle.onclick = () => {
        isVoiceEnabled = !isVoiceEnabled;
        if (isVoiceEnabled) {
            voiceToggle.classList.add('active');
            voiceToggle.classList.remove('off');
            voiceToggle.querySelector('span').textContent = 'VOICE ON';
            voiceToggle.querySelector('i').className = 'fas fa-volume-up';
            speak("Voice assistant activated.");
        } else {
            voiceToggle.classList.remove('active');
            voiceToggle.classList.add('off');
            voiceToggle.querySelector('span').textContent = 'VOICE OFF';
            voiceToggle.querySelector('i').className = 'fas fa-volume-mute';
            window.speechSynthesis.cancel();
        }
    };

    // 1. SINGLE SOURCE OF TRUTH (Centralized Traffic State Manager)
    let trafficState = { 
        level: 'medium',   // only: low, medium, high 
        routes: [], 
        selectedRouteIndex: 0,
        history: [],       // Last 5 predictions for temporal smoothing
        confidence: 0,     // Current prediction confidence
        stability: 'MODERATE' // HIGH, MODERATE, VOLATILE
    };

    // Helper for Predictive Consistency (Temporal Smoothing)
    const getStableLevel = (newLvl) => {
        if (isDemoMode) {
            // Lock transitions smoothly in Demo Mode
            const levels = ['low', 'medium', 'high'];
            const currentIndex = levels.indexOf(trafficState.level);
            const targetIndex = levels.indexOf(newLvl);
            
            if (Math.abs(currentIndex - targetIndex) > 1) {
                // Only move one step at a time for demo smoothness
                return levels[currentIndex + (targetIndex > currentIndex ? 1 : -1)];
            }
            return newLvl;
        }

        trafficState.history.push(newLvl);
        if (trafficState.history.length > 5) trafficState.history.shift();
        
        const counts = {};
        trafficState.history.forEach(l => counts[l] = (counts[l] || 0) + 1);
        
        // Calculate stability index
        const uniqueCount = Object.keys(counts).length;
        trafficState.stability = uniqueCount === 1 ? 'HIGH' : (uniqueCount <= 2 ? 'MODERATE' : 'VOLATILE');
        
        // Most frequent level
        return Object.keys(counts).reduce((a, b) => counts[a] >= counts[b] ? a : b);
    };

    // Demo Mode Logic
    demoToggle.onchange = (e) => {
        isDemoMode = e.target.checked;
        console.log(`[Demo Mode] ${isDemoMode ? 'ACTIVATED' : 'DEACTIVATED'}`);
        
        if (isDemoMode) {
            trafficState.stability = 'HIGH';
            trafficState.confidence = 98;
        }
        updateAISuggestionUI();
    };

    // 2. NORMALIZATION LAYER (MANDATORY)
    const normalizeTrafficLevel = (lvl) => {
        if (!lvl) return 'medium';
        const normalized = lvl.toLowerCase().trim();
        
        // 5. PREVENT WRONG STATE EXECUTION (Validation Layer)
        if (!['low', 'medium', 'high'].includes(normalized)) {
            console.warn(`[TrafficSense AI] Invalid traffic level: "${lvl}". Defaulting to "medium".`);
            return 'medium';
        }
        return normalized;
    };

    const cityConfigs = {
        'Kolkata': { coords: [22.5726, 88.3639], api: 'Kolkata Traffic Control API' },
        'Mumbai': { coords: [19.0760, 72.8777], api: 'Mumbai Urban Transit Data' },
        'Delhi': { coords: [28.6139, 77.2090], api: 'Delhi Smart City Grid' }
    };

    // City Selector Logic
    citySelector.onchange = (e) => {
        const city = e.target.value;
        const config = cityConfigs[city];
        
        // Update Map
        map.flyTo(config.coords, 13);
        startMarker.setLatLng(config.coords);
        endMarker.setLatLng([config.coords[0] + 0.02, config.coords[1] + 0.04]);
        
        updateRouteFromMarkers();
        
        // Update API Label
        apiLabel.innerHTML = `Connected to: ${config.api} (Simulated)`;
        
        // Visual feedback
        apiLabel.style.color = 'var(--low-traffic)';
        setTimeout(() => apiLabel.style.color = 'var(--accent-gold)', 2000);
    };

    // Emergency Mode Logic
    emergencyToggle.onchange = (e) => {
        isEmergencyMode = e.target.checked;
        const predictBtn = document.getElementById('predictBtn');
        
        if (isEmergencyMode) {
            predictBtn.classList.add('emergency-alert');
            predictBtn.querySelector('span').textContent = 'INITIATE EMERGENCY ROUTING';
        } else {
            predictBtn.classList.remove('emergency-alert');
            predictBtn.querySelector('span').textContent = 'INITIATE ANALYSIS';
        }

        // If routes already exist, re-evaluate immediately
        if (window.availableRoutes) {
            const bestRouteIndex = window.availableRoutes.reduce((bestIdx, curr, currIdx, arr) => 
                curr.time < arr[bestIdx].time ? currIdx : bestIdx, 0);
            
            if (isEmergencyMode) {
                 window.highlightRoute(bestRouteIndex);
             }
             
             updateAISuggestionUI();
         }
     };

    // LocalStorage Initialization
    let trafficHistory = JSON.parse(localStorage.getItem('trafficHistory')) || [];
    let favoriteRoutes = JSON.parse(localStorage.getItem('favoriteRoutes')) || [];
    let userName = localStorage.getItem('trafficSenseUserName') || 'Explorer';

    // Set Welcome Name
    document.getElementById('userWelcome').textContent = `Welcome, ${userName} 👋`;

    const updateRouteMetricsUI = (distance, time) => {
        const el = document.getElementById('routeMetrics');
        if (!el) return;
        
        // Smooth Number Change (Micro Animation)
        const oldContent = el.textContent;
        const oldTimeMatch = oldContent.match(/(\d+)\smin/);
        const oldTime = oldTimeMatch ? parseInt(oldTimeMatch[1]) : 0;
        
        if (oldTime > 0 && oldTime !== time) {
            let current = oldTime;
            const step = time > oldTime ? 1 : -1;
            const timer = setInterval(() => {
                current += step;
                el.textContent = `${distance.toFixed(1)} km | ${current} min`;
                if (current === time) clearInterval(timer);
            }, 50);
        } else {
            el.textContent = `${distance.toFixed(1)} km | ${time} min`;
        }

        el.classList.remove('metrics-update-glow');
        void el.offsetWidth; // Trigger reflow
        el.classList.add('metrics-update-glow');
    };

    const getRouteName = (route) => {
        if (route.name) return route.name;
        if (route.instructions && route.instructions.length > 0) {
            // Extract unique road names, filter short/invalid names
            const uniqueRoads = [...new Set(route.instructions
                .map(i => i.road)
                .filter(r => r && r.length > 3 && r !== "undefined")
            )].slice(0, 3);
            
            if (uniqueRoads.length > 0) return uniqueRoads.join(' via ');
        }
        // Fallback realistic names
        const fallbacks = ["NH Route", "City Bypass", "Urban Link Road"];
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    };

    // 3. HARD LOCK AI DECISION ENGINE (Strict Logic)
    const updateAISuggestionUI = () => {
        // 6. MICRO DELAY ENGINE (REALISM)
        setTimeout(() => {
            const suggestEl = document.getElementById('altRoute');
            const routes = trafficState.routes;
            if (!suggestEl || !routes || routes.length === 0) return;

            // SMART AUTO-SWITCH THRESHOLD (10% improvement rule)
            const mainRoute = routes[0];
            const currentSelected = routes[trafficState.selectedRouteIndex];
            
            const bestRouteIdx = routes.reduce((best, r, i, arr) => {
                return r.time < arr[best].time ? i : best;
            }, 0);
            
            const bestRoute = routes[bestRouteIdx];
            
            // Logic for route switching: must be 10% faster to switch automatically
            const improvementThreshold = 0.90; // 10% faster
            if (bestRoute.time < currentSelected.time * improvementThreshold) {
                // If high confidence (>85%), lock current decision
                if (trafficState.confidence <= 85 || isDemoMode) {
                    trafficState.selectedRouteIndex = bestRouteIdx;
                }
            }

            const activeRoute = routes[trafficState.selectedRouteIndex];
            const mainName = mainRoute.name || 'Main Route';
            const bestName = activeRoute.name || 'Optimal Route';
            
            const timeDiff = mainRoute.time - activeRoute.time;
            const efficiency = mainRoute.time > 0 ? Math.round((timeDiff / mainRoute.time) * 100) : 0;

            let situation = '';
            let action = '';
            let impact = '';
            let badge = '';

            // 4. HUMAN-LIKE AI MESSAGING (Story-Driven)
            if (trafficState.level === 'low') {
                situation = "Smooth traffic flow detected across the primary grid.";
                action = `Maintain current course via ${mainName}. It remains the most efficient path.`;
                impact = "Zero congestion latency. Optimal fuel efficiency maintained.";
                badge = efficiency > 10 ? `<span class="efficiency-badge">${efficiency}% faster</span>` : '';
            } else if (trafficState.level === 'medium') {
                situation = "Moderate congestion building up in the central corridors.";
                if (timeDiff >= 5) {
                    action = `Adaptive routing suggests switching to ${bestName} to bypass minor delays.`;
                    impact = `Estimated saving of ${timeDiff} minutes (${efficiency}% faster).`;
                    badge = `<span class="efficiency-badge highlight">${efficiency}% faster</span>`;
                } else {
                    action = `Main route via ${mainName} is still viable despite building density.`;
                    impact = "Current path stability is high. Rerouting not required.";
                }
            } else if (trafficState.level === 'high') {
                situation = "Severe congestion gridlock detected in the main sector.";
                action = `Immediate rerouting via ${bestName} is recommended to avoid heavy delays.`;
                impact = `Saves approximately ${timeDiff} minutes. Congestion override active.`;
                badge = efficiency > 0 ? `<span class="efficiency-badge critical">${efficiency}% faster</span>` : `<span class="efficiency-badge critical">Gridlock Warning</span>`;
            }

            // EMERGENCY OVERRIDE
            if (isEmergencyMode) {
                situation = "Emergency vehicle detected. Prioritizing clear-path routing.";
                action = `Switching to absolute fastest path via ${bestName}.`;
                impact = "Emergency Priority Protocol: Bypassing all non-essential traffic nodes.";
                badge = `<span class="efficiency-badge critical">EMERGENCY ACTIVE</span>`;
            }

            // Confidence Badge Logic
            let confidenceBadge = '';
            if (trafficState.confidence > 85) confidenceBadge = '<span class="efficiency-badge" style="background: rgba(16, 185, 129, 0.2); color: var(--low-traffic);">🟢 HIGH RELIABILITY</span>';
            else if (trafficState.confidence >= 60) confidenceBadge = '<span class="efficiency-badge" style="background: rgba(245, 158, 11, 0.2); color: var(--medium-traffic);">🟡 MODERATE CONFIDENCE</span>';
            else confidenceBadge = '<span class="efficiency-badge" style="background: rgba(239, 68, 68, 0.2); color: var(--high-traffic);">🔴 LOW CONFIDENCE</span>';

            const lowConfWarning = trafficState.confidence < 60 ? '<div class="ai-insight-text" style="color: var(--high-traffic); border-left-color: var(--high-traffic);">⚠ Low confidence prediction — results may vary.</div>' : '';
            const stabilityLabel = `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.5rem; letter-spacing: 1px;">SYSTEM STABILITY: <span style="color: ${trafficState.stability === 'HIGH' ? 'var(--low-traffic)' : (trafficState.stability === 'MODERATE' ? 'var(--medium-traffic)' : 'var(--high-traffic)')}">${trafficState.stability}</span></div>`;
            
            // Route Comparison Panel
            const comparisonPanel = `
                <div class="route-comparison-panel">
                    <div class="comp-item">
                        <div class="comp-label">Main Route</div>
                        <div class="comp-val">${mainRoute.time} min</div>
                    </div>
                    <div class="comp-item">
                        <div class="comp-label">Optimal</div>
                        <div class="comp-val ${efficiency > 0 ? 'faster' : ''}">${activeRoute.time} min</div>
                    </div>
                </div>
            `;

            const trustBadges = `
                <div class="trust-badge">
                    <i class="fas fa-check-circle"></i> Real-time Simulation Active
                    <span style="margin: 0 5px;">|</span>
                    <i class="fas fa-microchip"></i> Powered by Neural Traffic Model
                </div>
            `;
            
            suggestEl.innerHTML = `
                <div class="suggestion-header" style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1rem;">
                    ${confidenceBadge} ${badge}
                </div>
                ${stabilityLabel}
                
                <div class="ai-story-container">
                    <div class="ai-story-row">
                        <i class="fas fa-traffic-light"></i>
                        <div>
                            <span class="ai-story-label">Current Situation:</span>
                            <span class="ai-story-val">${situation}</span>
                        </div>
                    </div>
                    <div class="ai-story-row">
                        <i class="fas fa-rocket"></i>
                        <div>
                            <span class="ai-story-label">Recommended:</span>
                            <span class="ai-story-val">${action}</span>
                        </div>
                    </div>
                    <div class="ai-story-row">
                        <i class="fas fa-chart-line"></i>
                        <div>
                            <span class="ai-story-label">Impact:</span>
                            <span class="ai-story-val">${impact}</span>
                        </div>
                    </div>
                </div>

                ${comparisonPanel}
                ${lowConfWarning}
                ${trustBadges}
            `;
            
            // ✅ Voice Assistant - ONLY after user submission
            if (userHasSubmittedPrediction) {
                let voiceMessage = "";
                if (isEmergencyMode) {
                    voiceMessage = `Emergency mode active. Prioritizing fastest path via ${bestName}.`;
                } else {
                    voiceMessage = `Traffic level is ${trafficState.level}. Recommended route is ${bestName}.`;
                }
                setTimeout(() => speak(voiceMessage), 500);
            }
            
            suggestEl.classList.remove('metrics-update-glow');
            void suggestEl.offsetWidth;
            suggestEl.classList.add('metrics-update-glow');

            // Visual Authority Mode
            applyVisualAuthority();
            
            // Update Header Status
            updateHeaderStatus();

            // 8. DEBUG PANEL
            console.table({
                "Intelligence Engine": {
                    LEVEL: trafficState.level.toUpperCase(),
                    CONFIDENCE: trafficState.confidence + "%",
                    STABILITY: trafficState.stability,
                    AUTO_SWITCH: (bestRoute.time < currentSelected.time * improvementThreshold) ? "YES" : "NO",
                    SELECTED: activeRoute.name,
                    DEMO_MODE: isDemoMode ? "ON" : "OFF"
                }
            });
        }, 300);
    };

    const updateHeaderStatus = () => {
        const textEl = document.getElementById('statusText');
        const dotEl = document.querySelector('.live-dot');
        if (!textEl || !dotEl) return;

        if (trafficState.level === 'low') {
            textEl.textContent = '🟢 Stable Flow';
            dotEl.style.background = 'var(--low-traffic)';
        } else if (trafficState.level === 'medium') {
            textEl.textContent = '🟡 Adaptive Routing';
            dotEl.style.background = 'var(--medium-traffic)';
        } else {
            textEl.textContent = '🔴 Congestion Override Active';
            dotEl.style.background = 'var(--high-traffic)';
        }
    };

    const applyVisualAuthority = () => {
        const paths = document.querySelectorAll('path.leaflet-interactive');
        const routePaths = Array.from(paths).filter(p => p.classList.contains('route-main') || p.classList.contains('route-alt'));
        
        routePaths.forEach((p, i) => {
            const isSelected = (i === trafficState.selectedRouteIndex);
            
            if (trafficState.level === 'high') {
                // HIGH TRAFFIC: Blur main, glow alternative
                if (i === 0 && !isSelected) { // Main route not selected
                    p.style.opacity = '0.3';
                    p.style.filter = 'blur(2px)';
                    p.style.strokeDasharray = '5, 10';
                    p.classList.remove('route-pulse');
                } else if (isSelected) {
                    p.style.opacity = '1';
                    p.style.filter = 'drop-shadow(0 0 15px var(--accent-gold))';
                    p.style.strokeWidth = '8';
                    p.classList.add('route-pulse');
                }
            } else if (trafficState.level === 'low') {
                // LOW TRAFFIC: Strong glow main, fade alternative
                if (i === 0) {
                    p.style.opacity = '1';
                    p.style.filter = 'drop-shadow(0 0 20px var(--low-traffic))';
                    p.style.strokeWidth = '10';
                    p.classList.add('route-pulse');
                } else {
                    p.style.opacity = '0.2';
                    p.style.filter = 'none';
                    p.style.strokeWidth = '4';
                    p.classList.remove('route-pulse');
                }
            } else {
                // MEDIUM: Standard behavior
                if (isSelected) {
                    p.style.opacity = '1';
                    p.style.filter = 'drop-shadow(0 0 10px var(--accent-gold))';
                    p.style.strokeWidth = '8';
                    p.classList.add('route-pulse');
                } else {
                    p.style.opacity = '0.3';
                    p.style.filter = 'none';
                    p.style.strokeWidth = '4';
                    p.classList.remove('route-pulse');
                }
            }
        });
    };

    // Function to highlight a specific route with Elite UX
    window.highlightRoute = (index) => {
        const paths = document.querySelectorAll('path.leaflet-interactive');
        // Filter for our route paths specifically
        const routePaths = Array.from(paths).filter(p => p.classList.contains('route-main') || p.classList.contains('route-alt'));
        
        routePaths.forEach((p, i) => {
            const isSelected = (i === index);
            
            if (isSelected) {
                p.style.strokeWidth = '8';
                p.style.opacity = '1';
                p.style.filter = `drop-shadow(0 0 15px var(--accent-gold))`;
                p.style.strokeDasharray = ""; // Solid when selected
                p.style.zIndex = "1000";
                p.classList.add('route-pulse'); // ADDED PULSE EFFECT
            } else {
                p.style.strokeWidth = '4';
                p.style.opacity = '0.2';
                p.style.filter = 'blur(1px)';
                p.style.strokeDasharray = "10, 10"; // Dashed when not selected
                p.style.zIndex = "1";
                p.classList.remove('route-pulse');
            }
        });
    };

    // Initialize Leaflet Map with Premium Colorful Styling
    const initMap = () => {
        const defaultCoords = [22.5726, 88.3639]; // Default: Kolkata
        
        map = L.map('map', {
            center: defaultCoords,
            zoom: 13,
            zoomControl: false,
            attributionControl: false
        });

        // Premium Colorful Voyager Tiles from CartoDB
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(map);

        // Custom Glowing Markers
        const startIcon = L.divIcon({
            className: 'marker-pin-wrapper',
            html: '<div class="marker-pin-start"></div><span class="marker-label">START</span>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const endIcon = L.divIcon({
            className: 'marker-pin-wrapper',
            html: '<div class="marker-pin-end"></div><span class="marker-label">DESTINATION</span>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        startMarker = L.marker(defaultCoords, { icon: startIcon, draggable: true }).addTo(map);
        endMarker = L.marker([22.58, 88.40], { icon: endIcon, draggable: true }).addTo(map);

        // Routing Logic with Alternatives
        routingControl = L.Routing.control({
            waypoints: [L.latLng(defaultCoords), L.latLng(22.58, 88.40)],
            routeWhileDragging: true,
            showAlternatives: true,
            addWaypoints: false, // Prevent users from adding waypoints manually
            altLineOptions: {
                styles: [{ color: '#f59e0b', opacity: 0.6, weight: 4, dashArray: '10, 15', className: 'route-alt' }]
            },
            lineOptions: {
                styles: [{ color: '#3b82f6', opacity: 0.8, weight: 6, className: 'route-main' }]
            },
            createMarker: () => null // Use our existing markers
        }).addTo(map);

        routingControl.on('routesfound', (e) => {
            const routes = e.routes;
            
            if (!routes || routes.length === 0) {
                // 9. FAILSAFE (Routing Fail)
                trafficState.level = 'medium';
                const suggestEl = document.getElementById('altRoute');
                if (suggestEl) {
                    suggestEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Simulated route: Connection to grid lost. <br> <span style="font-size: 0.8rem; opacity: 0.7;">Direct point-to-point synchronization active.</span>';
                }
                return;
            }

            // Store all routes in Central State
            trafficState.routes = routes.map((r, i) => {
                const dist = r.summary.totalDistance / 1000;
                const time = Math.round(r.summary.totalTime / 60);
                
                return {
                    route: r,
                    distance: dist,
                    time: time,
                    name: getRouteName(r) || (i === 0 ? 'Main Route' : 'Alternative Route')
                };
            });

            // Compatibility with legacy window.availableRoutes
            window.availableRoutes = trafficState.routes;

            const main = trafficState.routes[0];
            window.lastRouteStats = {
                distance: main.distance,
                time: main.time
            };

            // Smart Camera System
            map.fitBounds(main.route.coordinates, {
                padding: [80, 80],
                maxZoom: 14,
                duration: 1.5
            });

            // 4. FORCE MAP + AI SYNC
            if (loaderWrapper.classList.contains('hidden')) {
                // Determine which route to highlight based on traffic level
                const bestIdx = trafficState.routes.reduce((best, r, i, arr) => r.time < arr[best].time ? i : best, 0);
                
                // If High traffic, always suggest alternative (index 1 if exists)
                const highlightIdx = (trafficState.level === 'high' && trafficState.routes.length > 1) ? 1 : 0;
                
                window.highlightRoute(isEmergencyMode ? bestIdx : highlightIdx);
                
                const selectedData = trafficState.routes[isEmergencyMode ? bestIdx : highlightIdx];
                updateRouteMetricsUI(selectedData.distance, selectedData.time);
                updateAISuggestionUI();
                startLiveSimulation(); // START LIVE SIMULATION ENGINE
            }

            // Interactive Route Selection (PRO Level)
            setTimeout(() => {
                const paths = document.querySelectorAll('path.leaflet-interactive');
                const routePaths = Array.from(paths).filter(p => p.classList.contains('route-main') || p.classList.contains('route-alt'));
                
                routePaths.forEach((p, index) => {
                    p.style.cursor = 'pointer';
                    p.onclick = (e) => {
                        L.DomEvent.stopPropagation(e);
                        const selectedData = trafficState.routes[index];
                        
                        window.highlightRoute(index);
                        updateRouteMetricsUI(selectedData.distance, selectedData.time);
                        updateAISuggestionUI();
                    };
                });
            }, 100);
        });

        routingControl.on('routingerror', () => {
            // 9. FAILSAFE (Routing Error)
            trafficState.level = 'medium';
            const suggestEl = document.getElementById('altRoute');
            if (suggestEl) {
                suggestEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Routing synchronization failed. <br> <span style="font-size: 0.8rem; opacity: 0.7;">System operating on historical traffic fallback.</span>';
            }
        });

        startMarker.on('dragend', () => updateRouteFromMarkers());
        endMarker.on('dragend', () => updateRouteFromMarkers());
    };

    const updateRouteFromMarkers = async (skipReverse = false) => {
        const startPos = startMarker.getLatLng();
        const endPos = endMarker.getLatLng();
        
        routingControl.setWaypoints([
            L.latLng(startPos.lat, startPos.lng),
            L.latLng(endPos.lat, endPos.lng)
        ]);
        routingControl.route(); // FORCE route refresh
        
        if (skipReverse) return;
        
        try {
            const resStart = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${startPos.lat}&lon=${startPos.lng}`);
            const dataStart = await resStart.json();
            locationInput.value = dataStart.display_name.split(',')[0];

            const resEnd = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${endPos.lat}&lon=${endPos.lng}`);
            const dataEnd = await resEnd.json();
            destinationInput.value = dataEnd.display_name.split(',')[0];
        } catch (e) {}
    };

    const syncMapWithSearch = async (startQuery, endQuery) => {
        try {
            // Add "Kolkata" to improve local geocoding if needed, but allow global
            const qS = startQuery.includes(',') ? startQuery : `${startQuery}, Kolkata`;
            const qE = endQuery.includes(',') ? endQuery : `${endQuery}, Kolkata`;

            const resStart = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(qS)}&limit=1`);
            const dataStart = await resStart.json();
            const resEnd = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(qE)}&limit=1`);
            const dataEnd = await resEnd.json();

            if (dataStart.length > 0 && dataEnd.length > 0) {
                const s = [parseFloat(dataStart[0].lat), parseFloat(dataStart[0].lon)];
                const e = [parseFloat(dataEnd[0].lat), parseFloat(dataEnd[0].lon)];
                
                // Smoothly move markers and update routing
                startMarker.setLatLng(s);
                endMarker.setLatLng(e);
                
                routingControl.setWaypoints([
                    L.latLng(s[0], s[1]),
                    L.latLng(e[0], e[1])
                ]);
                routingControl.route(); // FORCE route refresh
                
                return true;
            }
        } catch (e) {}
        return false;
    };

    // Personalization & Insights
    const updatePersonalizationUI = () => {
        renderHistory();
        renderFavorites();
        generateAIInsights();
    };

    const renderHistory = () => {
        if (trafficHistory.length === 0) {
            historyList.innerHTML = '<p class="empty-msg">No recent analysis found.</p>';
            return;
        }
        historyList.innerHTML = '';
        trafficHistory.slice(0, 5).forEach(item => {
            const el = document.createElement('div');
            el.className = 'history-item';
            el.innerHTML = `
                <div class="item-info">
                    <h4>${item.location} → ${item.destination || 'Point B'}</h4>
                    <p>${item.day} at ${item.time}</p>
                </div>
                <div class="item-status ${item.result}">${item.result}</div>
            `;
            el.onclick = () => reloadPrediction(item);
            historyList.appendChild(el);
        });
    };

    const renderFavorites = () => {
        if (favoriteRoutes.length === 0) {
            favoritesList.innerHTML = '<p class="empty-msg">No favorite routes saved.</p>';
            return;
        }
        favoritesList.innerHTML = '';
        favoriteRoutes.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'favorite-item';
            
            // Stats fallback
            const dist = item.distance || '--';
            const time = item.time_est || '--';

            el.innerHTML = `
                <div class="item-info">
                    <h4>${item.location} → ${item.destination || 'Point B'}</h4>
                    <p><i class="fas fa-road"></i> ${dist} km | <i class="fas fa-clock"></i> ${time} min</p>
                </div>
                <div class="favorite-actions">
                    <button class="action-btn load-btn" title="Load Route">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                    <button class="action-btn delete-btn" title="Remove Favorite">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            
            // Add click events to specific elements
            el.querySelector('.item-info').onclick = () => reloadPrediction(item);
            el.querySelector('.load-btn').onclick = () => reloadPrediction(item);
            el.querySelector('.delete-btn').onclick = (e) => {
                e.stopPropagation();
                removeFavorite(index);
            };
            
            favoritesList.appendChild(el);
        });
    };

    window.removeFavorite = (index) => {
        // Add fade out animation before removal
        const items = favoritesList.querySelectorAll('.favorite-item');
        if (items[index]) {
            items[index].style.transform = 'translateX(50px)';
            items[index].style.opacity = '0';
            setTimeout(() => {
                favoriteRoutes.splice(index, 1);
                localStorage.setItem('favoriteRoutes', JSON.stringify(favoriteRoutes));
                renderFavorites();
            }, 300);
        } else {
            favoriteRoutes.splice(index, 1);
            localStorage.setItem('favoriteRoutes', JSON.stringify(favoriteRoutes));
            renderFavorites();
        }
    };

    const generateAIInsights = () => {
        if (trafficHistory.length === 0) return;
        const locations = trafficHistory.map(h => h.location);
        const topLoc = locations.sort((a,b) => locations.filter(v => v===a).length - locations.filter(v => v===b).length).pop();
        const times = trafficHistory.map(h => parseInt(h.time.split(':')[0]));
        const avgTime = Math.round(times.reduce((a,b) => a+b, 0) / times.length);
        const levels = trafficHistory.map(h => h.result);
        const avgDensity = Math.round((levels.filter(l => l === 'High').length / levels.length) * 100);

        document.getElementById('topLocation').textContent = topLoc;
        document.getElementById('peakTime').textContent = `${avgTime}:00`;
        document.getElementById('avgTraffic').textContent = `${avgDensity}%`;
        document.getElementById('aiSummary').textContent = avgDensity > 40 ? 
            `Neural analysis detect heavy usage patterns in ${topLoc}. Optimized window: ${avgTime + 2}:00.` : 
            `Your grid efficiency in ${topLoc} is exceptional. Premium mobility score maintained.`;
    };

    const reloadPrediction = (item) => {
        locationInput.value = item.location;
        destinationInput.value = item.destination || '';
        document.getElementById('day').value = item.day;
        document.getElementById('time').value = item.time;
        predictionForm.dispatchEvent(new Event('submit'));
    };

    saveRouteBtn.onclick = () => {
        const entry = {
            location: locationInput.value,
            destination: destinationInput.value,
            day: document.getElementById('day').value,
            time: document.getElementById('time').value,
            distance: window.lastRouteStats?.distance,
            time_est: window.lastRouteStats?.time,
            altRoute: document.getElementById('altRoute').textContent
        };
        if (!favoriteRoutes.find(f => f.location === entry.location && f.destination === entry.destination)) {
            favoriteRoutes.unshift(entry);
            localStorage.setItem('favoriteRoutes', JSON.stringify(favoriteRoutes));
            renderFavorites();
            saveRouteBtn.innerHTML = '<i class="fas fa-check"></i> Saved';
            setTimeout(() => saveRouteBtn.innerHTML = '<i class="fas fa-star"></i> Save Route', 2000);
        }
    };

    // Chart & Intensity
    const initChart = () => {
        const ctx = document.getElementById('trafficChart').getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 350);
        gradient.addColorStop(0, 'rgba(212, 175, 55, 0.4)');
        gradient.addColorStop(1, 'rgba(212, 175, 55, 0)');
        trafficChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '23:59'],
                datasets: [{ data: [15, 10, 85, 45, 95, 65, 20], borderColor: '#d4af37', borderWidth: 4, fill: true, backgroundColor: gradient, tension: 0.4, pointRadius: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8' } } } }
        });
    };

    const generateDynamicZones = (loc) => {
        const tags = ['Sector 7', 'Terminal A', 'Hub South', 'Grid 404', 'Alpha Node', 'Bypass'];
        currentZones = [{ name: loc.split(',')[0], intensity: Math.floor(Math.random() * 60 + 20) }];
        for(let i=0; i<5; i++) {
            currentZones.push({ 
                name: tags[i], 
                intensity: Math.floor(Math.random() * 80 + 10) 
            });
        }
        renderZones();
    };

    const renderZones = () => {
        const currentContainer = document.getElementById('heatmapContainer');
        currentContainer.innerHTML = '';
        currentZones.forEach((z, i) => {
            const row = document.createElement('div');
            row.className = 'area-row';
            row.setAttribute('data-aos', 'fade-left');
            row.setAttribute('data-aos-delay', i * 100);
            
            // Dynamic color based on intensity
            const color = z.intensity > 70 ? 'var(--high-traffic)' : (z.intensity > 40 ? 'var(--medium-traffic)' : 'var(--low-traffic)');
            
            row.innerHTML = `
                <div class="area-name">${z.name}</div>
                <div class="progress-track">
                    <div class="progress-bar" style="width: ${z.intensity}%; background: ${color}; box-shadow: 0 0 15px ${color}66"></div>
                </div>
                <div class="area-name" style="text-align:right; color: ${color}; font-weight: 700;">${z.intensity}%</div>
            `;
            currentContainer.appendChild(row);
        });
    };

    // Form Submission
    predictionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        userHasSubmittedPrediction = true; // User initiated prediction
        
        const loc = locationInput.value;
        const dest = destinationInput.value;
        const day = document.getElementById('day').value;
        const time = document.getElementById('time').value;

        // Display calculating state in metrics if elements exist
        const metricsEl = document.getElementById('routeMetrics');
        if (metricsEl) metricsEl.textContent = 'Calculating route...';

        const mapSynced = await syncMapWithSearch(loc, dest);
        generateDynamicZones(loc);

        initialState.classList.add('hidden');
        predictionContent.classList.add('hidden');
        loaderWrapper.classList.remove('hidden');
        predictionContent.classList.remove('pulse-active');

        try {
            const res = await fetch('/api/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location: loc, destination: dest, day, time })
            });
            const data = await res.json();
            if (data.status === 'success') {
                setTimeout(() => {
                    loaderWrapper.classList.add('hidden');
                    predictionContent.classList.remove('hidden');
                    predictionContent.classList.add('pulse-active');
                    
                    // Normalize and Store in Central State
                    const rawLvl = normalizeTrafficLevel(data.prediction);
                    trafficState.level = getStableLevel(rawLvl);
                    trafficState.confidence = parseInt(data.confidence) || 0;
                    
                    document.getElementById('trafficLevel').textContent = trafficState.level.toUpperCase();
                    document.getElementById('trafficLevel').className = `traffic-status ${data.prediction}`; // Keep original casing for CSS class
                    document.getElementById('confidenceScore').textContent = data.confidence;
                    document.getElementById('confidenceFill').style.width = data.confidence;
                    document.getElementById('bestTime').textContent = data.best_time;
                    
                    // Display distance and time in the results
                    let distance = 0;
                    let timeEst = 0;
                    
                    if (trafficState.routes && trafficState.routes.length > 0) {
                        const selected = trafficState.routes[0];
                        distance = selected.distance;
                        timeEst = selected.time;
                        window.lastRouteStats = { distance, time: timeEst };
                    }
                    
                    updateRouteMetricsUI(distance, timeEst);
                    
                    if (trafficState.routes) {
                        updateAISuggestionUI();
                        
                        const bestIdx = trafficState.routes.reduce((best, r, i, arr) => r.time < arr[best].time ? i : best, 0);
                        const highlightIdx = (trafficState.level === 'high' && trafficState.routes.length > 1) ? 1 : 0;
                        
                        window.highlightRoute(isEmergencyMode ? bestIdx : highlightIdx);
                    }
                    
                    updateChartVisuals();
                    animateStats();
                    
                    trafficHistory.unshift({ 
                        location: loc, 
                        destination: dest, 
                        day, 
                        time, 
                        result: data.prediction, 
                        distance: distance.toFixed(1),
                        time_est: timeEst,
                        timestamp: Date.now() 
                    });
                    localStorage.setItem('trafficHistory', JSON.stringify(trafficHistory));
                    updatePersonalizationUI();
                }, 1500);
            }
        } catch (err) {
            loaderWrapper.classList.add('hidden');
            initialState.classList.remove('hidden');
            if (metricsEl) metricsEl.textContent = 'Route calculation failed';
        }
    });

    const updateChartVisuals = () => {
        const lvl = trafficState.level.charAt(0).toUpperCase() + trafficState.level.slice(1);
        const colors = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981' };
        const data = { High: [40, 30, 95, 75, 100, 85, 50], Medium: [25, 20, 70, 50, 80, 65, 30], Low: [15, 10, 40, 25, 45, 35, 15] };
        trafficChart.data.datasets[0].data = data[lvl];
        trafficChart.data.datasets[0].borderColor = colors[lvl];
        
        // Update gradient color based on level
        const ctx = document.getElementById('trafficChart').getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 350);
        const rgb = lvl === 'High' ? '239, 68, 68' : (lvl === 'Medium' ? '245, 158, 11' : '16, 185, 129');
        gradient.addColorStop(0, `rgba(${rgb}, 0.3)`);
        gradient.addColorStop(1, `rgba(${rgb}, 0)`);
        trafficChart.data.datasets[0].backgroundColor = gradient;
        
        trafficChart.update();
    };

    const animateStats = () => {
        const lvl = trafficState.level.charAt(0).toUpperCase() + trafficState.level.slice(1);
        const m = { High: 1.6, Medium: 1, Low: 0.4 }[lvl];
        
        // Use real route stats if available, else random
        const dist = window.lastRouteStats ? parseFloat(window.lastRouteStats.distance) : (Math.random() * 15 + 5);
        const time = window.lastRouteStats ? parseInt(window.lastRouteStats.time) : Math.round(dist * 2 * m);

        const stats = { 
            'stat-vehicles': Math.floor((Math.random()*3000+8000)*m), 
            'stat-speed': Math.floor((Math.random()*25+30)/m), 
            'stat-delay': Math.floor((Math.random()*15+2)*m) 
        };
        
        Object.entries(stats).forEach(([id, val]) => {
            const el = document.getElementById(id);
            const suffix = id.includes('speed') ? ' KM/H' : (id.includes('delay') ? ' MIN' : '');
            let c = 0;
            const t = setInterval(() => {
                c += Math.ceil(val/30);
                if(c >= val) { el.textContent = val + suffix; clearInterval(t); }
                else el.textContent = c + suffix;
            }, 20);
        });
    };

    // Live Simulation Engine
    let simulationInterval;
    const startLiveSimulation = () => {
        if (simulationInterval) clearInterval(simulationInterval);
        
        // Show the map live label
        const liveLabel = document.getElementById('mapLiveLabel');
        if (liveLabel) liveLabel.style.display = 'flex';

        simulationInterval = setInterval(() => {
            if (!trafficState.routes || trafficState.routes.length === 0) return;

            // 1. LIVE TRAFFIC FLUCTUATION (±5% random variation)
            // Skip fluctuations in Demo Mode for predictable presentation
            if (!isDemoMode) {
                console.log("Live Simulation: Fluctuating traffic patterns...");
                
                let totalVariation = 0;
                trafficState.routes.forEach(route => {
                    const variation = 0.95 + Math.random() * 0.1;
                    route.time = Math.round(route.time * variation);
                    totalVariation += Math.abs(variation - 1);

                    // Add pulse animation to route on map
                    const paths = document.querySelectorAll('path.leaflet-interactive');
                    const routePaths = Array.from(paths).filter(p => p.classList.contains('route-main') || p.classList.contains('route-alt'));
                    routePaths.forEach(p => {
                        p.classList.remove('route-pulse');
                        void p.offsetWidth;
                        p.classList.add('route-pulse');
                    });
                });

                // 3. LIVE STATUS INDICATOR
                updateLiveStatusIndicator(totalVariation / trafficState.routes.length);
            }

            // 2. AUTO AI RE-EVALUATION
            const rawLvl = normalizeTrafficLevel(trafficState.level);
            trafficState.level = getStableLevel(rawLvl);

            updateAISuggestionUI();

            // 4. REAL-TIME ROUTE SWITCH (AUTO)
            if (window.currentHighlightedIndex !== undefined) {
                const bestIdx = trafficState.routes.reduce((best, r, i, arr) => r.time < arr[best].time ? i : best, 0);
                const bestRoute = trafficState.routes[bestIdx];
                const currentRoute = trafficState.routes[window.currentHighlightedIndex];
                
                // Smart Auto-Switch: 10% improvement and not high confidence lock
                if (bestRoute.time < currentRoute.time * 0.90 && trafficState.confidence <= 85) {
                    console.log("Predictive Switch: Significant improvement detected.");
                    window.highlightRoute(bestIdx);
                    
                    const suggestEl = document.getElementById('altRoute');
                    if (suggestEl) {
                        const alertBadge = '<span class="efficiency-badge switch-alert">⚡ Optimization: Faster route locked</span>';
                        if (!suggestEl.innerHTML.includes('switch-alert')) {
                            suggestEl.insertAdjacentHTML('afterbegin', alertBadge);
                        }
                    }
                }
            }

        }, 7000); // Every 7 seconds (between 5-10s)
    };

    const updateLiveStatusIndicator = (avgVariation) => {
        const statusEl = document.getElementById('liveStatus');
        const textEl = document.getElementById('statusText');
        const dotEl = statusEl.querySelector('.live-dot');
        
        if (!statusEl || !textEl || !dotEl) return;

        if (avgVariation < 0.02) {
            textEl.textContent = '🟢 STABLE FLOW';
            statusEl.style.color = 'var(--low-traffic)';
            statusEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            dotEl.style.background = 'var(--low-traffic)';
            dotEl.style.boxShadow = '0 0 15px var(--low-traffic)';
        } else if (avgVariation < 0.04) {
            textEl.textContent = '🟡 FLUCTUATING';
            statusEl.style.color = 'var(--medium-traffic)';
            statusEl.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            dotEl.style.background = 'var(--medium-traffic)';
            dotEl.style.boxShadow = '0 0 15px var(--medium-traffic)';
        } else {
            textEl.textContent = '🔴 HEAVY SURGE';
            statusEl.style.color = 'var(--high-traffic)';
            statusEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            dotEl.style.background = 'var(--high-traffic)';
            dotEl.style.boxShadow = '0 0 15px var(--high-traffic)';
        }
    };

    const originalHighlightRoute = window.highlightRoute;
    window.highlightRoute = (index) => {
        window.currentHighlightedIndex = index;
        originalHighlightRoute(index);
    };

    // Autocomplete Search System
    const setupAutocomplete = (inputEl, type) => {
        let currentSuggestions = [];
        let activeIndex = -1;
        const dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown hidden';
        inputEl.parentElement.appendChild(dropdown);

        const debounce = (func, delay) => {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => func(...args), delay);
            };
        };

        const fetchSuggestions = async (query) => {
            if (query.length < 3) {
                dropdown.classList.add('hidden');
                return;
            }

            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
                const data = await response.json();
                currentSuggestions = data;
                renderSuggestions(data);
            } catch (error) {
                console.error('Nominatim API Error:', error);
            }
        };

        const renderSuggestions = (suggestions) => {
            dropdown.innerHTML = '';
            if (suggestions.length === 0) {
                dropdown.classList.add('hidden');
                return;
            }

            suggestions.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                const displayName = item.display_name.split(',');
                const name = displayName[0];
                const region = displayName.slice(1).join(',').trim();

                div.innerHTML = `
                    <span class="autocomplete-name">${name}</span>
                    <span class="autocomplete-region">${region}</span>
                `;

                // FIX CLICK NOT WORKING: Use mousedown to trigger selection before blur
                div.onmousedown = (e) => {
                    e.preventDefault();
                    selectSuggestion(item);
                };
                dropdown.appendChild(div);
            });

            dropdown.classList.remove('hidden');
            activeIndex = -1;
        };

        const selectSuggestion = (item) => {
            // Safety Check
            if (!item || !item.lat || !item.lon) return;

            // Update Input UI
            inputEl.value = item.display_name;
            
            // Store coordinates in dataset for accuracy
            inputEl.dataset.lat = item.lat;
            inputEl.dataset.lng = item.lon;

            dropdown.innerHTML = '';
            dropdown.classList.add('hidden');
            
            const lat = parseFloat(item.lat);
            const lon = parseFloat(item.lon);

            if (type === 'start') {
                startMarker.setLatLng([lat, lon]);
            } else {
                endMarker.setLatLng([lat, lon]);
            }

            // Immediately update routing and map center
            routingControl.setWaypoints([
                startMarker.getLatLng(),
                endMarker.getLatLng()
            ]);
            routingControl.route(); // FORCE UPDATE
            
            map.panTo([lat, lon]);
        };

        inputEl.oninput = debounce((e) => fetchSuggestions(e.target.value), 300);

        // FIX DROPDOWN DISAPPEARING TOO FAST
        inputEl.onblur = () => {
            setTimeout(() => {
                dropdown.classList.add('hidden');
            }, 200);
        };

        inputEl.onkeydown = (e) => {
            const items = dropdown.querySelectorAll('.autocomplete-item');
            if (e.key === 'ArrowDown') {
                activeIndex = (activeIndex + 1) % items.length;
                updateActiveSuggestion(items);
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                activeIndex = (activeIndex - 1 + items.length) % items.length;
                updateActiveSuggestion(items);
                e.preventDefault();
            } else if (e.key === 'Enter') {
                if (activeIndex > -1) {
                    selectSuggestion(currentSuggestions[activeIndex]);
                    e.preventDefault();
                }
            } else if (e.key === 'Escape') {
                dropdown.classList.add('hidden');
            }
        };

        const updateActiveSuggestion = (items) => {
            items.forEach((item, index) => {
                if (index === activeIndex) {
                    item.classList.add('active');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('active');
                }
            });
        };
    };

    setupAutocomplete(locationInput, 'start');
    setupAutocomplete(destinationInput, 'end');

    initMap();
    initChart();
    updatePersonalizationUI();
    setInterval(() => {
        currentZones.forEach(z => z.intensity = Math.min(100, Math.max(0, z.intensity + Math.floor(Math.random()*5)-2)));
        renderZones();
    }, 4000);
});
