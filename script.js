openai_prices_per_million_prompt_and_completion_tokens = {
    "gpt-4o-mini": [0.15,0.6],
    "gpt-3.5-turbo": [0.5, 1.5],
    "gpt-4o": [5.0, 15.0],
    "gpt-4-turbo": [10.0, 30.0],
}
let activeFetchCount = 0;
const loadingIndicator = document.getElementById('loading');

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


async function chat_completion(text, show_loading=true, prompt="") {
    const apiKey = document.getElementById('api-key').value;
    const model = document.getElementById('model').value;
    if (!navigator.onLine) {
        alert('No internet connection. Please check your connection and try again.');
        return; // Exit the function if offline
    }
    try {
        fetch_method = show_loading ? fetchWithLoadingIndicator : fetch;
        const messages = [
                    { role: "system", content: prompt },
                    { role: "user", content: text },
                ]
        console.log("messages", messages);
        const response = await fetch_method('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
            })
        });
        const data = await response.json();
        const rewritten_text = data.choices[0].message.content;
        const prompt_tokens = data.usage.prompt_tokens;
        const completion_tokens = data.usage.completion_tokens;
        const price_per_prompt_token = openai_prices_per_million_prompt_and_completion_tokens[model][0] / 1000000;
        const price_per_completion_token = openai_prices_per_million_prompt_and_completion_tokens[model][1] / 1000000;
        const price = price_per_prompt_token * prompt_tokens + price_per_completion_token * completion_tokens;
        return [rewritten_text, price];
    } catch (error) {
        console.error(error);
        return [text, 0];
    }
}

let original_text = "";

document.getElementById('rewriteText').addEventListener('click', () => {
    navigator.clipboard.readText()
        .then(async text => {
            original_text = text;
            document.getElementById('result').innerHTML = "";
            const price_div = document.getElementById('price');
            price_div.innerText = "";
            const [rewritten_text, _, price] = await create_rewrite(original_text, "");
            const diff = compute_diff(original_text, rewritten_text);
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
                console.log("content", content);
                if (operation === 0) { // Unchanged section
                    const segments = content.split(/([.!?])/);
                    console.log("segments", segments);
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
                                    next_content = diff[i+1][1];
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

            for (const sentence of parallelSentences) {
                console.log("spacing", sentence.spacing);
                console.log("original", sentence.original);
                console.log("rewritten", sentence.rewritten);
                await calculateDiff(sentence.original, sentence.rewritten, sentence.spacing);
            }


            // const total_price = await calculateDiff(original_text, rewritten_text);
            price_div.innerText = `The calculations have cost about USD ${(price).toFixed(6)}.`;
    });
});

async function create_rewrite(sentence, spacing_character="") {
    const promptText = document.getElementById('prompt').value + " Please return only the rewritten text. No comments, or other text or inquiries.";
    const data = await chat_completion(`In this text\n\n${original_text}\n\n. Please, rewrite the sentence:\n\n${sentence}`, true, promptText);
    const price = data[1];
    const comments_enabled = document.getElementById('commentToggle').checked;
    let comment = "";
    if (data[0] !== sentence && comments_enabled) {
        const comment_data = await chat_completion(`Please give a one to two bullet points with maximum 5 words each, e.g. something like "shortened" or "removed unnecessary repetition", or "fixed grammar". What did change from \n\n ${sentence} \n\n to \n\n ${data[0]} \n\n given that this edit was performed based on the prompt ${prompt}`);
        comment = comment_data[0];
    }
    return [data[0] + spacing_character, comment, price];
}

function compute_diff(text1, text2) {
    const dmp = new diff_match_patch();
    const diff = dmp.diff_main(text1, text2);
    dmp.diff_cleanupSemantic(diff);
    return diff; // an array of [[{insert=1, delete=-1, equal=0}, text], ...]
}

async function calculateDiff(sentence, rewritten_sentence, spacing_character="") {
    const resultDiv = document.getElementById('result');

    const uniqueId = 'result-' + Math.random().toString(36).substr(2, 9);
    const newSpan = document.createElement('span');
    newSpan.id = uniqueId;
    newSpan.classList.add('sentence-area');
    resultDiv.appendChild(newSpan);

    function create_initial_diff_html(text1, text2, comment="") {
        diff = compute_diff(text1, text2);

        let resultHTML = '';

        hover_buttons = `<div class="hover-buttons">
                        <button class="diff-button reject-button reject-one">❌</button> <!-- Cross symbol -->
                        <button class="diff-button accept-button accept-one">✅</button> <!-- Tick symbol -->
                    </div>`;

        diff.forEach((part, index) => {
            if (part[0] === 1) {
                // Added text (green)
                const prevPart = diff[index - 1];
                if (prevPart && prevPart[0] === -1) {
                    // Previous part was deleted text (red)
                    resultHTML += `<span class="text diff-part edit-area" data-index="${index}"><del>${prevPart[1]}</del><ins>${part[1]}</ins>${hover_buttons}</span>`;
                } else {
                    resultHTML += `<span class="text diff-part only-ins edit-area"><ins class=" edit-area" data-index="${index}">${part[1]}</ins>${hover_buttons}</span>`;
                }
            } else if (part[0] === -1) {
                // Deleted text (red)
                const nextPart = diff[index + 1];
                if (nextPart && nextPart[0] === 1) {
                    // Next part is added text (green)
                    // Handled in the next iteration
                } else {
                    resultHTML += `<span class="text diff-part only-del edit-area"><del class=" edit-area" data-index="${index}">${part[1]}</del>${hover_buttons}</span>`;
                }
            } else {
                // Unchanged text
                resultHTML += `<span contenteditable="true" class="text unchanged-text" data-index="${index}" style="color:black">${part[1]}</span>`;
            }
        });

        newSpan.innerHTML = resultHTML;
        comment_part = (comment !== "") ? `<span class='comment-label' style="color: #888; font-size: 0.8em;">Comment:</span>  <p class="comment-text">${comment.replace(/\n/g, '<br>')}</p>` : "";
        const sentenceHoverButtons = `<div class="comment-box">
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
        if (newSpan.querySelector('.diff-part')) {
            newSpan.innerHTML += sentenceHoverButtons;
            addCommentBoxHoverEffect(newSpan);
        }

    async function redo_sentence_area(uniqueId) {
        const sentenceArea = document.getElementById(uniqueId);
        console.assert(sentenceArea.children.length === 2, "The sentence area should have exactly one child.");
        const spanChild = sentenceArea.children[0];
        console.assert(spanChild.classList.contains('unchanged-text'), "The child should have the class 'unchanged-text'.");
        const text1 = spanChild.innerText;
        const [text2, comment, price] = await create_rewrite(text1, spacing_character);
        create_initial_diff_html(text1, text2, comment);
    }

    function remove_comment_and_merge_if_no_open_edits(uniqueId) {
        const sentenceArea = document.getElementById(uniqueId);
        const openEdits = sentenceArea.querySelectorAll('.diff-part');
        if (openEdits.length === 0) {
            const commentBox = sentenceArea.querySelector('.comment-box');
            if (commentBox) {
                commentBox.remove();
            }
            const text_pieces = sentenceArea.querySelectorAll('.unchanged-text');
            let text = "";
            for (const piece of text_pieces) {
                text += piece.innerText;
            }
            sentenceArea.innerHTML = `<span contenteditable="true" class="unchanged-text">${text}</span>`;
            const redoButton = document.createElement('button');
            redoButton.innerText = '🔄'; // Unicode for a refresh symbol
            redoButton.classList.add('diff-button', 'redo-button');
            redoButton.addEventListener('click', async () => {
                await redo_sentence_area(uniqueId);
            });

            sentenceArea.appendChild(redoButton);
        }
    }

    function accept_edit(e) {
        console.log("accepting edit for e with text ", e.target.innerText);
        const diffPart = e.target.closest('.diff-part');
        const del_elem = diffPart.querySelector('del');
        const ins_elem = diffPart.querySelector('ins');
        if (del_elem) {
            del_elem.classList.add('fade-out');
        }
        if (ins_elem) {
            ins_elem.classList.add('black-font')
        }
        diffPart.addEventListener('transitionend', () => {
            // if there are both a del and an ins (thus an edit), this callback will be called twice
            // thus we first check, whether the diffPart still has a parent
            if (diffPart.parentElement) {
                const text = diffPart.querySelector('ins') ? diffPart.querySelector('ins').innerText : '';
                diffPart.outerHTML = `<span class="unchanged-text" contenteditable="true" style="color:black">${text}</span>`;
                remove_comment_and_merge_if_no_open_edits(uniqueId);
            }
        });
    }

    document.querySelectorAll('.accept-one').forEach(btn => {
        btn.addEventListener('click', (e) => {
            accept_edit(e);
        });
    });

    function reject_edit(e) {
        const diffPart = e.target.closest('.diff-part');
        const del_elem = diffPart.querySelector('del');
        const ins_elem = diffPart.querySelector('ins');
        if (ins_elem) {
            ins_elem.classList.add('fade-out');
        }
        if (del_elem) {
            del_elem.classList.add('black-font')
        }
        diffPart.addEventListener('transitionend', () => {
            if (diffPart.parentElement) {
                const text = diffPart.querySelector('del') ? diffPart.querySelector('del').innerText : '';
                diffPart.outerHTML = `<span class="unchanged-text" contenteditable="true" style="color:black">${text}</span>`;
                remove_comment_and_merge_if_no_open_edits(uniqueId);
            }
        });
    }

    document.querySelectorAll('.reject-one').forEach(btn => {
        btn.addEventListener('click', (e) => {
            reject_edit(e);
        });
    });

    function accept_all_edits(e) {
        newSpan.querySelectorAll('.diff-part').forEach(diffPart => {
            const acceptButton = diffPart.querySelector('.accept-button');
            if (acceptButton) {
                accept_edit({ target: acceptButton });
            }
        });
    }

    function reject_all_edits(e) {
        newSpan.querySelectorAll('.diff-part').forEach(diffPart => {
            const rejectButton = diffPart.querySelector('.reject-button');
            if (rejectButton) {
                reject_edit({ target: rejectButton });
            }
        });
    }

    if (newSpan.querySelector('.accept-all')) {
        newSpan.querySelector('.accept-all').addEventListener('click', accept_all_edits);
        newSpan.querySelector('.reject-all').addEventListener('click', reject_all_edits);
    }


    document.getElementById('result').classList.add('result-filled');
    }
    const text1 = sentence + spacing_character;
    const text2 = rewritten_sentence + spacing_character;
    create_initial_diff_html(text1, text2);
    return price;
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
tooltip_standard_text = "You need to first go through all changes";
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


// COOKIE LOGIC
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
};




