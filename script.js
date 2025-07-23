// Cache DOM Elements - improves performance by avoiding repeated DOM lookups
const elements = {
    screens: {
        start: document.getElementById('start-screen'),
        quiz: document.getElementById('quiz-screen'),
        results: document.getElementById('results-screen')
    },
    settings: {
        difficulty: document.getElementById('difficulty'),
        operation: document.getElementById('operation'),
        questions: document.getElementById('questions'),
        customQuestions: document.getElementById('custom-questions'),
        customQuestionsContainer: document.getElementById('custom-questions-container')
    },
    buttons: {
        start: document.getElementById('start-btn'),
        submit: document.getElementById('submit-btn'),
        restart: document.getElementById('restart-btn'),
        newQuiz: document.getElementById('new-quiz-btn')
    },
    quiz: {
        questionNumber: document.getElementById('question-number'),
        timer: document.getElementById('timer'),
        score: document.getElementById('score'),
        question: document.getElementById('question'),
        answerInput: document.getElementById('answer-input'),
        feedback: document.getElementById('feedback')
    },
    results: {
        finalScore: document.getElementById('final-score'),
        correctAnswers: document.getElementById('correct-answers'),
        totalTime: document.getElementById('total-time'),
        avgTime: document.getElementById('avg-time'),
        questionsReview: document.getElementById('questions-review')
    }
};

// Create a document fragment for batch DOM updates
const fragment = document.createDocumentFragment();

// Quiz state
let currentQuestion = 0;
let score = 0;
let timer = 0;
let timerInterval;
let questions = [];
let answers = [];
let questionData = [];
let startTime;
let endTime;
let totalQuestions;

// Event listeners with debouncing to prevent multiple rapid clicks
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Use event delegation where possible to reduce the number of event listeners
const debouncedSubmit = debounce(submitAnswer, 100);

// Lightweight click handler for buttons
function addClickHandler(element, handler) {
    element.addEventListener('click', handler, { passive: true });
}

// Add optimized event listeners
addClickHandler(elements.buttons.start, startQuiz);
addClickHandler(elements.buttons.submit, debouncedSubmit);
addClickHandler(elements.buttons.restart, restartQuiz);
addClickHandler(elements.buttons.newQuiz, showStartScreen);

// Allow pressing Enter to submit answer with debouncing
elements.quiz.answerInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault(); // Prevent default to avoid form submission
        debouncedSubmit();
    }
});

// Optimize dropdown performance
const dropdowns = [elements.settings.difficulty, elements.settings.operation, elements.settings.questions];
dropdowns.forEach(dropdown => {
    // Use passive event listeners for better performance
    dropdown.addEventListener('change', function() {
        // Prevent layout thrashing by batching reads/writes
        requestAnimationFrame(() => {
            // This empty frame ensures the UI remains responsive during selection
            
            // Handle custom questions option
            if (dropdown === elements.settings.questions) {
                if (dropdown.value === 'custom') {
                    elements.settings.customQuestionsContainer.style.display = 'flex';
                    elements.settings.customQuestions.focus();
                } else {
                    elements.settings.customQuestionsContainer.style.display = 'none';
                }
            }
        });
    }, { passive: true });
    
    // Prevent excessive repaints during dropdown interaction
    dropdown.addEventListener('focus', function() {
        document.body.classList.add('dropdown-active');
    }, { passive: true });
    
    dropdown.addEventListener('blur', function() {
        document.body.classList.remove('dropdown-active');
    }, { passive: true });
});


// Difficulty settings
const difficultySettings = {
    easy: {
        addition: { min1: 1, max1: 20, min2: 1, max2: 20 },
        subtraction: { min1: 1, max1: 20, min2: 1, max2: 20 },
        multiplication: { min1: 1, max1: 10, min2: 1, max2: 10 },
        division: { min1: 1, max1: 50, min2: 1, max2: 10 }
    },
    medium: {
        addition: { min1: 10, max1: 50, min2: 10, max2: 50 },
        subtraction: { min1: 10, max1: 50, min2: 10, max2: 50 },
        multiplication: { min1: 2, max1: 15, min2: 2, max2: 15 },
        division: { min1: 10, max1: 100, min2: 2, max2: 10 }
    },
    hard: {
        addition: { min1: 20, max1: 100, min2: 20, max2: 100 },
        subtraction: { min1: 20, max1: 100, min2: 20, max2: 100 },
        multiplication: { min1: 5, max1: 20, min2: 5, max2: 20 },
        division: { min1: 20, max1: 200, min2: 2, max2: 20 }
    },
    extreme: {
        addition: { min1: 50, max1: 500, min2: 50, max2: 500 },
        subtraction: { min1: 50, max1: 500, min2: 50, max2: 500 },
        multiplication: { min1: 10, max1: 50, min2: 10, max2: 50 },
        division: { min1: 50, max1: 500, min2: 2, max2: 50 }
    }
};

// Functions
function startQuiz() {
    // Cache dropdown values to prevent reflow
    const difficultyValue = elements.settings.difficulty.value;
    const operationValue = elements.settings.operation.value;
    
    // Handle custom questions count
    let questionsCount;
    if (elements.settings.questions.value === 'custom') {
        questionsCount = parseInt(elements.settings.customQuestions.value);
        // Validate custom questions count
        if (isNaN(questionsCount) || questionsCount < 1) {
            questionsCount = 30; // Default fallback
        } else if (questionsCount > 100) {
            questionsCount = 100; // Maximum limit
        }
    } else {
        questionsCount = parseInt(elements.settings.questions.value);
    }
    
    totalQuestions = questionsCount;
    
    // Reset quiz state
    currentQuestion = 0;
    score = 0;
    timer = 0;
    questions = [];
    answers = [];
    questionData = [];
    
    // Prepare UI updates before generating questions
    elements.quiz.questionNumber.textContent = `1/${totalQuestions}`;
    elements.quiz.score.textContent = '0';
    elements.quiz.timer.textContent = '0s';
    
    // Generate all questions at once - improves performance
    // Use setTimeout to prevent UI freezing during question generation
    setTimeout(() => {
        generateQuestions(difficultyValue, operationValue, totalQuestions);
        displayQuestion();
        
        // Start timer after questions are generated
        startTime = performance.now();
        timerInterval = setInterval(updateTimer, 1000);
        
        // Focus on answer input
        elements.quiz.answerInput.focus();
    }, 0);
    
    // Show quiz screen immediately - don't wait for question generation
    elements.screens.start.classList.remove('active');
    elements.screens.quiz.classList.add('active');
    elements.screens.results.classList.remove('active');
}

function generateQuestions(difficulty, operation, count) {
    for (let i = 0; i < count; i++) {
        let question, answer;
        let currentOperation = operation;
        
        if (operation === 'mixed') {
            // Randomly select an operation for mixed mode
            const operations = ['addition', 'subtraction', 'multiplication', 'division'];
            currentOperation = operations[Math.floor(Math.random() * operations.length)];
        }
        
        const settings = difficultySettings[difficulty][currentOperation];
        
        switch (currentOperation) {
            case 'addition':
                [question, answer] = generateAdditionQuestion(settings);
                break;
            case 'subtraction':
                [question, answer] = generateSubtractionQuestion(settings);
                break;
            case 'multiplication':
                [question, answer] = generateMultiplicationQuestion(settings);
                break;
            case 'division':
                [question, answer] = generateDivisionQuestion(settings);
                break;
        }
        
        questions.push(question);
        answers.push(answer);
    }
}

function generateAdditionQuestion(settings) {
    const num1 = getRandomNumber(settings.min1, settings.max1);
    const num2 = getRandomNumber(settings.min2, settings.max2);
    return [`${num1} + ${num2} = ?`, num1 + num2];
}

function generateSubtractionQuestion(settings) {
    let num1 = getRandomNumber(settings.min1, settings.max1);
    let num2 = getRandomNumber(settings.min2, settings.max2);
    
    // Ensure num1 is greater than or equal to num2 to avoid negative answers
    if (num1 < num2) {
        [num1, num2] = [num2, num1];
    }
    
    return [`${num1} - ${num2} = ?`, num1 - num2];
}

function generateMultiplicationQuestion(settings) {
    const num1 = getRandomNumber(settings.min1, settings.max1);
    const num2 = getRandomNumber(settings.min2, settings.max2);
    return [`${num1} × ${num2} = ?`, num1 * num2];
}

function generateDivisionQuestion(settings) {
    // For division, we need to ensure the answer is an integer
    let num2 = getRandomNumber(settings.min2, settings.max2);
    let answer = getRandomNumber(1, Math.floor(settings.max1 / num2));
    let num1 = num2 * answer;
    
    return [`${num1} ÷ ${num2} = ?`, answer];
}

function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function displayQuestion() {
    // Batch DOM updates in a single animation frame
    requestAnimationFrame(() => {
        elements.quiz.question.textContent = questions[currentQuestion];
        elements.quiz.answerInput.value = '';
        elements.quiz.feedback.textContent = '';
        elements.quiz.feedback.className = 'feedback';
    });
}

function updateTimer() {
    timer++;
    // Use textContent instead of innerHTML for better performance
    elements.quiz.timer.textContent = `${timer}s`;
}

function submitAnswer() {
    // Prevent multiple submissions while processing
    elements.buttons.submit.disabled = true;
    
    const userAnswer = parseInt(elements.quiz.answerInput.value);
    
    // Validate input
    if (isNaN(userAnswer)) {
        elements.quiz.feedback.textContent = 'Please enter a valid number';
        elements.quiz.feedback.className = 'feedback incorrect';
        elements.quiz.answerInput.focus();
        elements.buttons.submit.disabled = false;
        return;
    }
    
    const correctAnswer = answers[currentQuestion];
    const isCorrect = userAnswer === correctAnswer;
    
    // Update score silently without showing any feedback
    if (isCorrect) {
        score++;
        elements.quiz.score.textContent = score;
    }
    
    // Clear any feedback text to avoid slowing down the app
    elements.quiz.feedback.textContent = '';
    elements.quiz.feedback.className = 'feedback';
    
    // Store user's answer for review - use object literal for better performance
    questionData[currentQuestion] = {
        question: questions[currentQuestion],
        correctAnswer,
        userAnswer,
        isCorrect
    };
    
    // Move to next question or end quiz immediately without any delay
    currentQuestion++;
    
    if (currentQuestion < totalQuestions) {
        elements.quiz.questionNumber.textContent = `${currentQuestion + 1}/${totalQuestions}`;
        displayQuestion();
        elements.quiz.answerInput.focus();
    } else {
        endQuiz();
    }
    elements.buttons.submit.disabled = false;
}

function endQuiz() {
    // Stop timer
    clearInterval(timerInterval);
    endTime = performance.now();
    const totalTimeInSeconds = Math.floor((endTime - startTime) / 1000);
    const avgTimePerQuestion = (totalTimeInSeconds / totalQuestions).toFixed(1);
    
    // Update results screen - batch DOM updates
    requestAnimationFrame(() => {
        elements.results.finalScore.textContent = score;
        elements.results.correctAnswers.textContent = `${score}/${totalQuestions}`;
        elements.results.totalTime.textContent = `${totalTimeInSeconds}s`;
        elements.results.avgTime.textContent = `${avgTimePerQuestion}s`;
        
        // Generate questions review
        generateQuestionsReview();
        
        // Show results screen
        elements.screens.quiz.classList.remove('active');
        elements.screens.results.classList.add('active');
    });
}

function generateQuestionsReview() {
    // Clear previous content
    elements.results.questionsReview.innerHTML = '';
    
    // Use document fragment for batch DOM insertion - much faster
    const fragment = document.createDocumentFragment();
    
    // Create all elements at once
    for (let i = 0; i < totalQuestions; i++) {
        const answer = questionData[i];
        
        const reviewItem = document.createElement('div');
        reviewItem.className = `review-item ${answer.isCorrect ? 'correct' : 'incorrect'}`;
        
        const questionSpan = document.createElement('span');
        questionSpan.className = 'review-question';
        questionSpan.textContent = answer.question;
        
        const answerSpan = document.createElement('div');
        answerSpan.className = `review-answer ${answer.isCorrect ? 'correct' : 'incorrect'}`;
        
        // Use textContent where possible instead of innerHTML for better performance
        const resultSpan = document.createElement('span');
        if (answer.isCorrect) {
            resultSpan.textContent = `${answer.userAnswer} ✓`;
        } else {
            resultSpan.textContent = `${answer.userAnswer} ✗ (${answer.correctAnswer})`;
        }
        
        answerSpan.appendChild(resultSpan);
        reviewItem.appendChild(questionSpan);
        reviewItem.appendChild(answerSpan);
        
        fragment.appendChild(reviewItem);
    }
    
    // Add all elements to DOM in a single operation
    elements.results.questionsReview.appendChild(fragment);
}

function restartQuiz() {
    // Keep the same settings and restart
    startQuiz();
}

function showStartScreen() {
    // Go back to start screen to change settings - use requestAnimationFrame for smoother transitions
    requestAnimationFrame(() => {
        elements.screens.start.classList.add('active');
        elements.screens.quiz.classList.remove('active');
        elements.screens.results.classList.remove('active');
    });
}

// Add event listener for page visibility to pause timer when tab is inactive
document.addEventListener('visibilitychange', function() {
    if (document.hidden && timerInterval) {
        // Pause timer when tab is inactive
        clearInterval(timerInterval);
    } else if (!document.hidden && currentQuestion < totalQuestions && currentQuestion >= 0) {
        // Resume timer when tab becomes active again
        timerInterval = setInterval(updateTimer, 1000);
    }
});

// Preload operations to avoid calculation delays during quiz
function preloadOperations() {
    // Perform some dummy calculations to ensure math operations are optimized
    const dummyOps = [
        () => 1 + 1,
        () => 10 - 5,
        () => 3 * 4,
        () => 10 / 2
    ];
    
    // Execute each operation once
    dummyOps.forEach(op => op());
}

// Call preload on page load
preloadOperations();