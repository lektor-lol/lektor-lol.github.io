openai_prices_per_million_prompt_and_completion_tokens = {
    "gpt-3.5-turbo": [0.5, 1.5],
    "gpt-4o": [5.0, 15.0],
    "gpt-4-turbo": [10.0, 30.0],
}


document.getElementById('rewriteText').addEventListener('click', () => {
    const text1 = document.getElementById('text1').value;
    const apiKey = document.getElementById('api-key').value;
    const prompt = document.getElementById('prompt').value;
    const loadingIndicator = document.getElementById('loading');
    const model = document.getElementById('model').value;

    if (!navigator.onLine) {
        alert('No internet connection. Please check your connection and try again.');
        return; // Exit the function if offline
    }

    loadingIndicator.style.display = 'block';

    fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: text1 },
      ]
    })
  })
  .then(response => response.json())
  .then(data => {
    loadingIndicator.style.display = 'none';
    const rewritten_text = data.choices[0].message.content;
    console.log(data)
    const prompt_tokens = data.usage.prompt_tokens
    const completion_tokens = data.usage.completion_tokens
    console.log(model, openai_prices_per_million_prompt_and_completion_tokens)
    const price_per_prompt_token = openai_prices_per_million_prompt_and_completion_tokens[model][0] / 1000000.
    const price_per_completion_token = openai_prices_per_million_prompt_and_completion_tokens[model][1] / 1000000.
    const price = price_per_prompt_token * prompt_tokens + price_per_completion_token * completion_tokens
    console.log(prompt_tokens, completion_tokens, openai_prices_per_million_prompt_and_completion_tokens[model][0], price_per_prompt_token, price_per_completion_token, price)
    document.getElementById('price').innerText = `The last calculation has cost about ${(price*100).toFixed(4)} dollar cent.`
    calculateDiff(rewritten_text);
  })
  .catch(error => {
    loadingIndicator.style.display = 'none';
    console.error(error)});
});

function calculateDiff(text2) {
    const text1 = document.getElementById('text1').value;
    const resultDiv = document.getElementById('result');

    const dmp = new diff_match_patch();
    const diff = dmp.diff_main(text1, text2);
    dmp.diff_cleanupSemantic(diff);

    let resultHTML = '';

    hover_buttons = `<div class="hover-buttons">
                       <button class="diff-button reject-button">❌</button> <!-- Cross symbol -->
                       <button class="diff-button accept-button">✅</button> <!-- Tick symbol -->
                   </div>`;

    diff.forEach((part, index) => {
        if (part[0] === 1) {
            // Added text (green)
            const prevPart = diff[index - 1];
            if (prevPart && prevPart[0] === -1) {
                // Previous part was deleted text (red)
                resultHTML += `<span class="diff-part hover-container" data-index="${index}"><del>${prevPart[1]}</del><ins>${part[1]}</ins>${hover_buttons}</span>`;
            } else {
                resultHTML += `<span class="diff-part only-ins hover-container"><ins class=" hover-container" data-index="${index}">${part[1]}</ins>${hover_buttons}</span>`;
            }
        } else if (part[0] === -1) {
            // Deleted text (red)
            const nextPart = diff[index + 1];
            if (nextPart && nextPart[0] === 1) {
                // Next part is added text (green)
                // Handled in the next iteration
            } else {
                resultHTML += `<span class="diff-part only-del hover-container"><del class=" hover-container" data-index="${index}">${part[1]}</del>${hover_buttons}</span>`;
            }
        } else {
            // Unchanged text
            resultHTML += `<span class="unchanged-text" data-index="${index}" style="color:black">${part[1]}</span>`;
        }
    });

    resultDiv.innerHTML = resultHTML;

    document.querySelectorAll('.accept-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
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
                const text = diffPart.querySelector('ins') ? diffPart.querySelector('ins').innerText : '';
                diffPart.outerHTML = `<span class="diff-part" style="color:black">${text}</span>`;
            });
        });
    });

    document.querySelectorAll('.reject-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const diffPart = e.target.closest('.diff-part');
            const del_elem = diffPart.querySelector('del');
            const ins_elem = diffPart.querySelector('ins');
            function replace_with_normal_text() {
                
            }
            if (ins_elem) {
                console.log("there is an ins")
                ins_elem.classList.add('fade-out');
            }
            if (del_elem) {
                del_elem.classList.add('black-font')
            }
            diffPart.addEventListener('transitionend', () => {
                const text = diffPart.querySelector('del') ? diffPart.querySelector('del').innerText : '';
                console.log(text, diffPart.querySelector('del'));
                diffPart.outerHTML = `<span class="diff-part" style="color:black">${text}</span>`;
            });
        });
    });

    
}



// COOKIE LOGIC
// LOCALSTORAGE LOGIC

// Function to set an item in localStorage
function setLocalStorageItem(name, value) {
    console.log("setting localStorage item", name, value);
    localStorage.setItem(name, value);
}

// Function to get an item from localStorage by name
function getLocalStorageItem(name) {
    console.log("getting localStorage item", name, localStorage.getItem(name));
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




