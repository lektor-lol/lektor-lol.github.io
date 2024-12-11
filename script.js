import { DiffHandler } from './diff_handler.js';

/*
What does my current state contain?
- current prompt
- current edited text

how does one change the state?
- one can change the prompt
- one can change the edited text
    - overwrite all text
    - accept/reject a change
    - change the text
*/

let past_state_transitions = [] // list of tuples (uniqueId of span, new diff)
let future_state_transitions = [] // stack of tuples, the last undone change on top

function get_last_change(uniqueId) {
    return past_state_transitions.findLast(([id]) => id === uniqueId)?.[1];
}

function add_change(uniqueId, diff, a_redo_change=false) {
    const old_diff = get_last_change(uniqueId);
    if (old_diff !== diff) {  // either this is undefined or this is something else, really
        if (old_diff !== undefined){
            enable_button('undoLastChange')    
        }
        past_state_transitions.push([uniqueId, diff]);
        if (!a_redo_change) {
            future_state_transitions = [];
            disable_button('redoLastUndo')
        }
    }
}

function enable_button(id) {
    document.getElementById(id).classList.remove('disabled-button');
    document.getElementById(id).classList.add('button');
    document.getElementById(id).disabled = false;
}

function disable_button(id) {
    document.getElementById(id).classList.remove('button');
    document.getElementById(id).classList.add('disabled-button'); 
    document.getElementById(id).disabled = true;
}

function enable_undo_button_if_right_change_exists(uniqueId) {
    const lastUniqueId = past_state_transitions[past_state_transitions.length - 1]?.[0];
    const hasPreviousChange = past_state_transitions.slice(0, -1).some(([id, _]) => id === lastUniqueId);
    if (hasPreviousChange) {
        enable_button('undoLastChange')
    } else {
        disable_button('undoLastChange')
    }
}

function undo_last_change() {
    const [uniqueId, new_diff] = past_state_transitions.pop();
    future_state_transitions.push([uniqueId, new_diff]);
    enable_button('redoLastUndo')


    const diff = get_last_change(uniqueId);
    create_diff_html(uniqueId, diff);
    // Check if there are any previous changes for this uniqueId
    enable_undo_button_if_right_change_exists(uniqueId);
}

function redo_last_change() {
    const [uniqueId, new_diff] = future_state_transitions.pop();

    create_diff_html(uniqueId, new_diff, "", true);
    if (future_state_transitions.length === 0) {
        disable_button('redoLastUndo')
    }
}

document.getElementById('undoLastChange').addEventListener('mouseup', function() {
    if (!this.disabled) {
        undo_last_change();
    }
});
document.getElementById('redoLastUndo').addEventListener('mouseup', function() {
    if (!this.disabled) {
        redo_last_change();
    }
});


let openai_prices_per_million_prompt_and_completion_tokens = {
    "gpt-4o-mini": [0.15,0.6],
    "gpt-3.5-turbo": [0.5, 1.5],
    "gpt-4o": [5.0, 15.0],
    "gpt-4-turbo": [10.0, 30.0],
}
let activeFetchCount = 0;
const loadingIndicator = document.getElementById('loading');
const diffHandler = new DiffHandler();

function updateLoadingIndicator() {
    if (activeFetchCount > 0) {
        loadingIndicator.style.display = 'block';
    } else {
        loadingIndicator.style.display = 'none';
    }
}

async function fetchWithLoadingIndicator(url, options = {}) {
    activeFetchCount++;
    updateLoadingIndicator();

    try {
        const response = await fetch(url, options);
        return response;
    } finally {
        activeFetchCount--;
        updateLoadingIndicator();
    }
}

function addPromptToPastPrompts(prompt) {
    const savedPrompts = JSON.parse(localStorage.getItem('pastPrompts') || '[]');

    // Remove the prompt if it already exists
    const existingIndex = savedPrompts.indexOf(prompt);
    if (existingIndex !== -1) {
        savedPrompts.splice(existingIndex, 1);
    }

    // Add prompt to the top of the list
    savedPrompts.unshift(prompt);

    // Save to localStorage
    localStorage.setItem('pastPrompts', JSON.stringify(savedPrompts));

    // Update UI
    updatePastPromptsUI(savedPrompts);
}

function updatePastPromptsUI(savedPrompts = null) {
    const pastPrompts = document.getElementById('past-prompts');
    pastPrompts.innerHTML = ''; // Clear existing options

    // Add an empty option as the first prompt
    const emptyOption = document.createElement('option');
    emptyOption.text = '';
    emptyOption.value = '';
    pastPrompts.add(emptyOption);

    // If no savedPrompts provided, load from localStorage
    if (savedPrompts === null) {
        savedPrompts = JSON.parse(localStorage.getItem('pastPrompts') || '[]');
    }

    savedPrompts.forEach(prompt => {
        const option = document.createElement('option');
        option.text = prompt;
        option.value = prompt;
        pastPrompts.add(option);
    });
}

const openai_api_url = 'https://api.openai.com/v1/chat/completions'
const lektor_api_url = 'https://lektorlol-92565035393.europe-west4.run.app/chat/completions'
// const lektor_api_url = 'http://127.0.0.1:1234/chat/completions'

async function chat_completion(text, show_loading=true, prompt="") {
    const apiKey = document.getElementById('api-key').value;
    const model = document.getElementById('model').value;
    if (!navigator.onLine) {
        alert('No internet connection. Please check your connection and try again.');
        return; // Exit the function if offline
    }
    let fetch_method = show_loading ? fetchWithLoadingIndicator : fetch;
    const messages = [
                { role: "system", content: prompt },
                { role: "user", content: text },
            ]
    const response = await fetch_method(model === 'gpt-4o-mini' ? lektor_api_url : openai_api_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
        }),
        timeout: 20 * 1000 // in milli seconds
    });
    if (!response.ok) {
        if (response.status === 401) {
            throw new Error(`Unauthorized - please check your API key`);
        }
        throw new Error(`HTTP error! status: ${response.status}, ${response.statusText}`);
    }
    const data = await response.json();
    const answer = data.choices[0].message.content;
    const prompt_tokens = data.usage.prompt_tokens;
    const completion_tokens = data.usage.completion_tokens;
    const price_per_prompt_token = openai_prices_per_million_prompt_and_completion_tokens[model][0] / 1000000;
    const price_per_completion_token = openai_prices_per_million_prompt_and_completion_tokens[model][1] / 1000000;
    const price = price_per_prompt_token * prompt_tokens + price_per_completion_token * completion_tokens;
    
    return [answer, price];
}

async function create_rewrite(sentence, spacing_character="", full_text=false) {
    const promptText = document.getElementById('prompt').value + " Please return only the rewritten text. No comments, other text, or inquiries.";
    const data = await chat_completion(`In this text\n\n${original_text}\n\n. Please, rewrite:\n\n${sentence}`, true, promptText);
    const price = data[1];
    const comments_enabled = document.getElementById('commentToggle') ? document.getElementById('commentToggle').checked : true;
    let comment = "";
    if (data[0] !== sentence && comments_enabled && !full_text) {
        const comment_data = await chat_completion(`Please give one to two bullet points with maximum 5 words each, e.g. something like "shortened" or "removed unnecessary repetition", or "fixed grammar". What did change from \n\n ${sentence} \n\n to \n\n ${data[0]} \n\n given that this edit was performed based on the prompt ${prompt}`);
        comment = comment_data[0];
    }
    return [data[0] + spacing_character, comment, price];
}


function text_to_html(text) {
    return text.replace(/\n/g, '<br>');
}

function html_to_text(html) {
    return html.replace(/<br>/g, '\n');
}

let original_text = "";

document.getElementById('rewriteText').addEventListener('click', () => {
    navigator.clipboard.readText()
        .then(async text => {
            const max_chars = 10000
            if (text.length > max_chars) {
                alert(`Sorry, the text is too long. Please limit your input to ${max_chars.toLocaleString()} characters.`)
                return;
            }
            // disable undo/redo buttons
            disable_button('undoLastChange')
            disable_button('redoLastUndo')
            prompt = document.getElementById('prompt').value;
            addPromptToPastPrompts(prompt);             

            original_text = text;
            document.getElementById('result').innerHTML = "";
            const price_div = document.getElementById('price');
            price_div.innerText = "";
            let rewritten_text, _, price;
            try {
                [rewritten_text, _, price] = await create_rewrite(original_text, "", true);
            } catch (error) {
                console.error('Error:', error);
                alert(error);
                return;
            }
            const diff = diffHandler.computeDiff(original_text, rewritten_text);
            // Split the original and rewritten text on punctuation in unchanged sections

            let originalSentences = [];
            let rewrittenSentences = [];
            let spacingCharacters = [];
            let currentOriginal = '';
            let currentRewritten = '';
            let currentSpacing = '';

            for (let i = 0; i < diff.length; i++) {
                const operation = diff[i][0];
                const content = diff[i][1];
                if (operation === 0) { // Unchanged section
                    const segments = content.split(/([.!?])/);
                    for (let j = 0; j < segments.length; j++) {
                        currentOriginal += segments[j];
                        currentRewritten += segments[j];
                        if (j % 2 === 1) { // Punctuation
                            // Extract spacing from the original text
                            if (j < segments.length - 1 && segments[j+1] !== "") {
                                const nextSegment = segments[j+1];
                                currentSpacing = nextSegment.match(/^\s*/)[0];
                            }
                            else {
                                currentSpacing = "";
                                if (i < diff.length - 1) {
                                    let next_content = diff[i+1][1];
                                    currentSpacing = next_content.match(/^\s*/)[0];
                                }
                            }
                            originalSentences.push(currentOriginal.trim());
                            rewrittenSentences.push(currentRewritten.trim());
                            spacingCharacters.push(currentSpacing);
                            currentOriginal = '';
                            currentRewritten = '';
                            currentSpacing = '';
                        }
                    }
                } else if (operation === -1) { // Deletion
                    currentOriginal += content;
                } else if (operation === 1) { // Addition
                    currentRewritten += content;
                }
            }

            if (currentOriginal || currentRewritten) {
                originalSentences.push(currentOriginal.trim());
                rewrittenSentences.push(currentRewritten.trim());
                spacingCharacters.push('');
            }

            let parallelSentences = originalSentences.map((original, index) => ({
                original,
                rewritten: rewrittenSentences[index],
                spacing: spacingCharacters[index]
            }));

            // Check if sentences should be merged
            const mergedParallelSentences = [parallelSentences[0]];
            for (let i = 1; i < parallelSentences.length; i++) {
                let currentSentence = parallelSentences[i-1];
                let nextSentence = parallelSentences[i];

                // Prepare prompt to ask if sentences should be merged
                //const prompt = `Are these two utterances seperated by the end of a sentence? Is the mark at the end of utterance indicating the ending of that sentence? Example 1:\nU1: 1.\n\n\n\nU2: August 2014.\nAnswer: NO\n\nExample 2:\nU1: I like sauce.\n\n\n\nU2: I like mayo on the 6.\nAnswer: YES\n\nOnly answer YES or NO.\n\nU1: ${currentSentence.rewritten}\n\n\n\nU2: ${nextSentence.rewritten}`;
                const prompt = `Does the following sentence end here or go on. If it ends answer YES otherwise NO:\n\n\n\n"${currentSentence.original}"`

                let shouldMerge = false;
                try {
                    const [response, merge_price] = await chat_completion(prompt);
                    shouldMerge = !response.toLowerCase().includes('yes');
                    price += merge_price;

                    
                    if (shouldMerge) {
                        // Merge the sentences with the last sentence in mergedParallelSentences
                        const lastSentence = mergedParallelSentences[mergedParallelSentences.length - 1];
                        mergedParallelSentences[mergedParallelSentences.length - 1] = {
                            original: lastSentence.original + lastSentence.spacing + nextSentence.original,
                            rewritten: lastSentence.rewritten + lastSentence.spacing + nextSentence.rewritten,
                            spacing: nextSentence.spacing
                        };
                    }
                } catch (error) {
                    console.error('Error checking sentence merge:', error);
                }
                if (!shouldMerge) {
                    mergedParallelSentences.push(nextSentence);
                    if (mergedParallelSentences.length > 1) {
                        const previous_index = mergedParallelSentences.length - 2
                        const sentence = mergedParallelSentences[previous_index];
                        displayDiff(sentence.original, sentence.rewritten, sentence.spacing);
                    }
                }
            }

            const previous_index = mergedParallelSentences.length - 1
            const sentence = mergedParallelSentences[previous_index];
            displayDiff(sentence.original, sentence.rewritten, sentence.spacing);


            // const total_price = await calculateDiff(original_text, rewritten_text);
            const model = document.getElementById('model').value
            if (model === 'gpt-4o-mini') {
                price_div.innerText = ''
            } else {
                price_div.innerText = `The calculations have cost about USD ${(price).toFixed(6)}.`;
            }
    });
});


function create_diff_html(uniqueId, diff, comment="", a_redo_change=false) {
    if (!diff) {
        console.error("No diff provided for uniqueId:", uniqueId);
        return;
    }
    const span = getSpan(uniqueId)
    if (add_change) {
        add_change(uniqueId, diff, a_redo_change);
    }
    let resultHTML = '';

    let hover_buttons = `<div id="hover-buttons-${getUniqueString()}" class="hover-buttons" contenteditable="false">
                    <button class="diff-button reject-button reject-one" contenteditable="false" style="user-select: none;">❌</button> <!-- Cross symbol -->
                    <button class="diff-button accept-button accept-one" contenteditable="false" style="user-select: none;">✅</button> <!-- Tick symbol -->
                </div>`;

    diff.forEach((part, index) => {
        if (part[0] === 1) {
            // Added text (green)
            const prevPart = diff[index - 1];
            if (prevPart && prevPart[0] === -1) {
                // Previous part was deleted text (red)
                resultHTML += `<span id="diff-part-${getUniqueString()}" class="text diff-part edit-area" data-index-ins="${index}" data-index-del="${index-1}"><del contenteditable="false">${text_to_html(prevPart[1])}</del><ins contenteditable="false">${text_to_html(part[1])}</ins>${hover_buttons}</span>`;
            } else {
                resultHTML += `<span class="text diff-part only-ins edit-area" data-index-ins="${index}"><ins class="edit-area" contenteditable="false">${text_to_html(part[1])}</ins>${hover_buttons}</span>`;
            }
        } else if (part[0] === -1) {
            // Deleted text (red)
            const nextPart = diff[index + 1];
            if (nextPart && nextPart[0] === 1) {
                // Next part is added text (green)
                // Handled in the next iteration
            } else {
                resultHTML += `<span class="text diff-part only-del edit-area" data-index-del="${index}"><del class="edit-area" contenteditable="false">${text_to_html(part[1])}</del>${hover_buttons}</span>`;
            }
        } else {
            // Unchanged text
            resultHTML += `<span contenteditable="true" class="text unchanged-text" data-index="${index}" style="color:black">${text_to_html(part[1])}</span>`;
        }
    });

    span.innerHTML = resultHTML;
    let comment_part = (comment !== "") ? `<span class='comment-label' style="color: #888; font-size: 0.8em;">Comment:</span>  <p class="comment-text">${text_to_html(comment)}</p>` : "";
    const sentenceHoverButtons = `<div class="comment-box" contenteditable="false">
                                    ${comment_part}
                                    <span style="color: #888; font-size: 0.8em;">Accept or reject all of the above:</span>
                                    <button class="diff-button reject-button reject-all">❌</button> <!-- Cross symbol -->
                                    <button class="diff-button accept-button accept-all">✅</button> <!-- Tick symbol -->
                                </div>`;

    // Add this new function after the sentenceHoverButtons definition
    function addCommentBoxHoverEffect(newSpan) {
        const commentBoxButtons = newSpan.querySelectorAll('.comment-box .diff-button');
        commentBoxButtons.forEach(button => {
            button.addEventListener('mouseenter', () => {
                newSpan.querySelectorAll('.text').forEach(span => {
                    span.classList.add('hover-highlight');
                });
            });
            button.addEventListener('mouseleave', () => {
                newSpan.querySelectorAll('.text').forEach(span => {
                    span.classList.remove('hover-highlight');
                });
            });
        });
    }

    // Call this function after adding the sentenceHoverButtons
    if (span.querySelector('.diff-part')) {
        span.innerHTML += sentenceHoverButtons;
        addCommentBoxHoverEffect(span);
    } else {
        // Remove hover highlight from all spans in the sentence area
        const allSpans = span.querySelectorAll('span');
        allSpans.forEach(span => {
            span.classList.remove('hover-highlight');
        });

        const redoButton = document.createElement('button');
        redoButton.innerText = '🔄'; // Unicode for a refresh symbol
        redoButton.classList.add('diff-button', 'redo-button');
        redoButton.contentEditable = false;
        redoButton.addEventListener('click', async () => {
            await redo_sentence_area(uniqueId);
        });

        span.appendChild(redoButton);
    }

    async function redo_sentence_area(uniqueId) {
        if (!diff.every(part => part[0] === 0)) {
            throw new Error("Diff should have no edits");
        }
        let content = diff.map(part => part[1]).join('');
        let trailingSpace = content.match(/\s$/);
        if (trailingSpace) {
            content = content.slice(0, -1);
        } else {
            trailingSpace = "";
        }
        const [text2, comment, price] = await create_rewrite(content, trailingSpace);
        create_diff_html(uniqueId, diffHandler.computeDiff(content, text2), comment);
    }

    function accept_edit(e, update_diff=true) {
        const diffPart = e.target.closest('.diff-part');
        const del_elem = diffPart.querySelector('del');
        const ins_elem = diffPart.querySelector('ins');
        if (del_elem) {
            del_elem.classList.add('fade-out');
        }
        if (ins_elem) {
            ins_elem.classList.add('black-font')
        }

        let transition_ended = false;

        diffPart.addEventListener('transitionend', (e) => {
            // if there are both a del and an ins (thus an edit), this callback will be called twice
            // thus we first check, whether the diffPart still has a parent
            if (!transition_ended && update_diff) {
                transition_ended = true;
                const data_index_ins = diffPart.getAttribute('data-index-ins');
                const data_index_del = diffPart.getAttribute('data-index-del');
                create_diff_html(uniqueId, diffHandler.acceptEditByIndex(diff, data_index_ins, data_index_del));

                // const text = diffPart.querySelector('ins') ? diffPart.querySelector('ins').innerText : '';
                // diffPart.outerHTML = `<span class="unchanged-text" contenteditable="true" style="color:black">${text}</span>`;
                // merge_and_remove_comment_if_no_open_edits(uniqueId, data_index);
            }
        });
    }

    span.querySelectorAll('.accept-one').forEach(btn => {
        btn.addEventListener('click', (e) => {
            accept_edit(e);
        });
    });

    function reject_edit(e, update_diff=true) {
        const diffPart = e.target.closest('.diff-part');
        const del_elem = diffPart.querySelector('del');
        const ins_elem = diffPart.querySelector('ins');
        if (ins_elem) {
            ins_elem.classList.add('fade-out');
        }
        if (del_elem) {
            del_elem.classList.add('black-font')
        }
        let transition_ended = false;
        diffPart.addEventListener('transitionend', () => {
            if (!transition_ended && update_diff) {
                transition_ended = true;
                const data_index_ins = diffPart.getAttribute('data-index-ins');
                const data_index_del = diffPart.getAttribute('data-index-del');
                create_diff_html(uniqueId, diffHandler.rejectEditByIndex(diff, data_index_ins, data_index_del));
            }
        });
    }

    span.querySelectorAll('.reject-one').forEach(btn => {
        btn.addEventListener('click', (e) => {
            reject_edit(e);
        });
    });

    function accept_all_edits_callback(e) {
        span.querySelectorAll('.diff-part').forEach(diffPart => {
            const acceptButton = diffPart.querySelector('.accept-button');
            if (acceptButton) {
                accept_edit({ target: acceptButton }, false);
            }
        });
        span.addEventListener('transitionend', () => {
            create_diff_html(uniqueId, diffHandler.acceptAllEdits(diff));
        }, { once: true });
    }

    function reject_all_edits_callback(e) {
        span.querySelectorAll('.diff-part').forEach(diffPart => {
            const rejectButton = diffPart.querySelector('.reject-button');
            if (rejectButton) {
                reject_edit({ target: rejectButton }, false);
            }
        });
        span.addEventListener('transitionend', () => {
            create_diff_html(uniqueId, diffHandler.rejectAllEdits(diff));
        }, { once: true });
    }

    if (span.querySelector('.accept-all')) {
        span.querySelector('.accept-all').addEventListener('click', accept_all_edits_callback);
        span.querySelector('.reject-all').addEventListener('click', reject_all_edits_callback);
    }


    // Add event listener to unchanged text areas to keep diff in sync
    span.querySelectorAll('.unchanged-text').forEach(unchangedSpan => {
        unchangedSpan.addEventListener('input', (e) => {
            const index = parseInt(unchangedSpan.getAttribute('data-index'));
            diff[index][1] = unchangedSpan.textContent;
        });
    });

    document.getElementById('result').classList.add('result-filled');
}

function getUniqueString() {
    return Math.random().toString(36).substr(2, 9);
}

async function displayDiff(sentence, rewritten_sentence, spacing_character="") {
    const resultDiv = document.getElementById('result');

    const uniqueId = 'result-' + getUniqueString();
    const newSpan = document.createElement('span');
    newSpan.id = uniqueId;
    newSpan.classList.add('sentence-area');
    resultDiv.appendChild(newSpan);


    const text1 = sentence + spacing_character;
    const text2 = rewritten_sentence + spacing_character;
    create_diff_html(uniqueId, diffHandler.computeDiff(text1, text2));
    return price;
}

function getSpan(uniqueId){
    const resultDiv = document.getElementById('result');
    const span = resultDiv.querySelector(`#${uniqueId}`);
    return span;
}


function get_current_rewritten_text(accept_all_edits = true) {
    const resultDiv = document.getElementById('result');
    const allSpans = resultDiv.querySelectorAll('span');
    let text = "";
    for (const span of allSpans) {
        if (span.classList.contains('diff-part')) {
            if (accept_all_edits) {
                const insElement = span.querySelector('ins');
                text += insElement ? insElement.innerText : '';
            } else {
                const delElement = span.querySelector('del');
                text += delElement ? delElement.innerText : '';
            }
        } else if (span.classList.contains('unchanged-text')) {
            text += span.innerText;
        }
    }
    return text;
}

const floatingButton = document.getElementById('copy-all-text-button');

// Function to update button state
function updateButtonState() {
    const resultDiv = document.getElementById('result');
    const openChanges = resultDiv.querySelectorAll('.diff-part:not(.fade-out)');
    const hasText = resultDiv.textContent.trim().length > 0;
    
    if (!hasText) {
        floatingButton.style.visibility = 'hidden';
    } else if (openChanges.length > 0) {
        floatingButton.style.visibility = 'visible';
        floatingButton.style.opacity = '0.5';
        floatingButton.style.backgroundColor = '#555';
        floatingButton.disabled = true;
    } else {
        floatingButton.style.visibility = 'visible';
        floatingButton.style.opacity = '1';
        floatingButton.style.backgroundColor = '#007bff';
        floatingButton.disabled = false;
    }
}

// Call updateButtonState initially and after any changes
updateButtonState();
const observer = new MutationObserver(updateButtonState);
observer.observe(document.getElementById('result'), { childList: true, subtree: true, characterData: true });

const tooltip = document.getElementById('copy-all-text-button-tooltip');
let tooltip_standard_text = "You need to first go through all changes";
tooltip.textContent = tooltip_standard_text;

// Show/hide tooltip on hover when button is disabled
floatingButton.addEventListener('mouseenter', () => {
    if (floatingButton.disabled) {
        tooltip.style.opacity = '1';
    }
});
floatingButton.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
});

// Add click event listener to the button
floatingButton.addEventListener('click', function() {
    if (!this.disabled) {
        const text = get_current_rewritten_text();
        if (text.trim().length > 0) {
            navigator.clipboard.writeText(text).then(() => {
                tooltip.textContent = 'All text copied to clipboard!';
                tooltip.style.opacity = '1';
                setTimeout(() => {
                    tooltip.style.opacity = '0';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        } else {
            tooltip.textContent = 'No text to copy!';
            tooltip.style.opacity = '1';
            setTimeout(() => {
                tooltip.style.opacity = '0';
            }, 2000);
        }
    }
});

tooltip.addEventListener('transitionend', function onTransitionEnd(event) {
    if (event.propertyName === 'opacity' && tooltip.style.opacity === '0') {
        tooltip.textContent = tooltip_standard_text;
    }
});

document.getElementById('predefined-prompts').addEventListener('change', function() {
    const promptInput = document.getElementById('prompt');
    promptInput.value = this.options[this.selectedIndex].text;
    // trigger the input event
    promptInput.dispatchEvent(new Event('input'));
    const predefinedPromptsDropdown = document.getElementById('predefined-prompts');
    predefinedPromptsDropdown.selectedIndex = 0;
});

document.getElementById('past-prompts').addEventListener('change', function() {
    const promptInput = document.getElementById('prompt');
    promptInput.value = this.options[this.selectedIndex].text;
    // trigger the input event
    promptInput.dispatchEvent(new Event('input'));
    const pastPromptsDropdown = document.getElementById('past-prompts');
    pastPromptsDropdown.selectedIndex = 0;
});

document.getElementById('model').addEventListener('change', function() {
    const apiKeyLabel = document.getElementById('api-key').parentElement;
    if (this.value !== 'gpt-4o-mini') {
        apiKeyLabel.style.display = 'inline';
    } else {
        apiKeyLabel.style.display = 'none';
    }
});


// LOCALSTORAGE LOGIC

// Function to set an item in localStorage
function setLocalStorageItem(name, value) {
    localStorage.setItem(name, value);
}

// Function to get an item from localStorage by name
function getLocalStorageItem(name) {
    return localStorage.getItem(name);
}

// Function to save textbox content to localStorage
function saveTextToLocalStorage(event) {
    var textBoxId = event.target.id;
    var textBoxContent = event.target.value;
    setLocalStorageItem(textBoxId, textBoxContent);
}

// Function to load textbox content from localStorage
function loadTextFromLocalStorage() {
    console.log("loading text from localStorage");
    var textBoxes = document.querySelectorAll('.save-as-cookie');
    textBoxes.forEach(function(textBox) {
        var textBoxId = textBox.id;
        var textBoxContent = getLocalStorageItem(textBoxId);
        if (textBoxContent !== null) {
            textBox.value = textBoxContent;
        }
        console.log("adding event listener for textbox", textBox);
        textBox.addEventListener('input', saveTextToLocalStorage);
    });
}


window.onload = function() {
    loadTextFromLocalStorage();
    updatePastPromptsUI();
    window.debug = {
        get_last_change,
        add_change,
        undo_last_change,
        past_state_transitions,
        diffHandler,
        get_current_rewritten_text,
        future_state_transitions,
    }
};
