/*if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then((registration) => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }, (error) => {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}
*/

document.addEventListener('DOMContentLoaded', () => {
    const homeSection = document.getElementById('home-section');
    const transactionsSection = document.getElementById('transactions-section');
    const walletsSection = document.getElementById('wallets-section');
    const categoriesSection = document.getElementById('categories-section');

    const PAGE_SIZE = 20; // Default page size
    let currentPage = 1; // Initial page

    document.getElementById('home-nav').addEventListener('click', () => {
        showSection(homeSection);
    });

    document.getElementById('transactions-nav').addEventListener('click', () => {
        showSection(transactionsSection);
        loadTransactions();
    });

    document.getElementById('add-nav').addEventListener('click', () => {
        const addTransactionModal = new bootstrap.Modal(document.getElementById('addTransactionModal'));
        addTransactionModal.show();
    });

    document.getElementById('wallets-nav').addEventListener('click', () => {
        showSection(walletsSection);
    });

    document.getElementById('categories-nav').addEventListener('click', () => {
        showSection(categoriesSection);
    });

    function showSection(section) {
        homeSection.classList.add('d-none');
        transactionsSection.classList.add('d-none');
        walletsSection.classList.add('d-none');
        categoriesSection.classList.add('d-none');
        section.classList.remove('d-none');
    }

    let db;
    const request = indexedDB.open('walletBudgetDB', 1);

    request.onerror = function (event) {
        console.error('Database error:', event.target.errorCode);
    };

    request.onsuccess = function (event) {
        db = event.target.result;
        // Load initial data
        loadWallets();
        loadTransactions();
        loadCategories();
        updateCharts();
        populateCategoryAndWalletOptions();
    };

    request.onupgradeneeded = function (event) {
        db = event.target.result;
        db.createObjectStore('wallets', {keyPath: 'id', autoIncrement: true});
        db.createObjectStore('transactions', {keyPath: 'id', autoIncrement: true});
        db.createObjectStore('categories', {keyPath: 'id', autoIncrement: true});
    };

    // Functions to load data
    function loadWallets() {
        if (!db) return;

        // Step 1: Get all wallets
        const walletTransaction = db.transaction(['wallets'], 'readonly');
        const walletObjectStore = walletTransaction.objectStore('wallets');
        const walletRequest = walletObjectStore.getAll();

        walletRequest.onsuccess = function (event) {
            const wallets = event.target.result;
            const walletBalances = {};
            wallets.forEach(wallet => {
                walletBalances[wallet.id] = {
                    ...wallet,
                    balance: 0 // Initialize with 0
                };
            });

            // Step 2: Get all transactions to calculate wallet balances
            const transactionTransaction = db.transaction(['transactions'], 'readonly');
            const transactionObjectStore = transactionTransaction.objectStore('transactions');
            const transactionRequest = transactionObjectStore.getAll();

            transactionRequest.onsuccess = function (event) {
                const transactions = event.target.result;

                transactions.forEach(transaction => {
                    if (walletBalances[transaction.wallet]) {
                        if (transaction.type === 'income') {
                            walletBalances[transaction.wallet].balance += transaction.amount;
                        } else if (transaction.type === 'expense') {
                            walletBalances[transaction.wallet].balance -= transaction.amount;
                        }
                    }
                });

                // Step 3: Update the UI with the calculated balances
                const walletsOverview = document.getElementById('wallets-overview');
                const walletsList = document.getElementById('wallets-list');
                walletsOverview.innerHTML = '';
                walletsList.innerHTML = '';
                Object.values(walletBalances).forEach(wallet => {
                    const card = document.createElement('div');
                    card.classList.add('col-6');
                    card.innerHTML = `<div class="card" style="border-left: 5px solid ${wallet.color};">
                                    <div class="card-body">
                                        <h5 class="card-title">${wallet.name}</h5>
                                        <p class="card-text">Balance: ${wallet.balance.toFixed(2)}</p>
                                    </div>
                                  </div>`;
                    walletsOverview.appendChild(card);

                    const item = document.createElement('li');
                    item.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
                    item.innerHTML = `
                    <span>${wallet.name} - ${wallet.balance.toFixed(2)}</span>
                    <span>
                        <button class="btn btn-sm btn-warning edit-wallet" data-id="${wallet.id}"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger delete-wallet" data-id="${wallet.id}"><i class="fas fa-trash"></i></button>
                    </span>
                `;
                    walletsList.appendChild(item);
                });
            };
        };
    }

    // Add Wallet
    document.getElementById('new-wallet-btn').addEventListener('click', () => {
        const addWalletModal = new bootstrap.Modal(document.getElementById('addWalletModal'));
        addWalletModal.show();
    });

    document.getElementById('add-wallet-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('wallet-name').value;
        const color = document.getElementById('wallet-color').value;
        const initialBalance = parseFloat(document.getElementById('wallet-balance').value);
        const creationDate = new Date().toISOString().substring(0, 10); // Get current date in YYYY-MM-DD format

        const walletTransaction = db.transaction(['wallets'], 'readwrite');
        const walletObjectStore = walletTransaction.objectStore('wallets');
        const walletRequest = walletObjectStore.add({ name, color, balance: 0 }); // Set initial balance to 0

        walletRequest.onsuccess = function(event) {
            const walletId = event.target.result;

            const transactionTransaction = db.transaction(['transactions'], 'readwrite');
            const transactionObjectStore = transactionTransaction.objectStore('transactions');
            transactionObjectStore.add({
                amount: initialBalance,
                date: creationDate,
                type: 'income',
                category: null, // No category for initial balance
                wallet: walletId
            });

            transactionTransaction.oncomplete = () => {
                loadWallets();
                loadTransactions();
                populateCategoryAndWalletOptions();
                updateCharts();
                const addWalletModal = bootstrap.Modal.getInstance(document.getElementById('addWalletModal'));
                addWalletModal.hide();
                document.getElementById('add-wallet-form').reset();
            };
        };
    });
    // Edit Wallet
    document.getElementById('wallets-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-wallet') || e.target.closest('.edit-wallet')) {
            const id = Number(e.target.dataset.id);
            const transaction = db.transaction(['wallets'], 'readonly');
            const objectStore = transaction.objectStore('wallets');
            const request = objectStore.get(id);

            request.onsuccess = (event) => {
                const wallet = event.target.result;
                document.getElementById('edit-wallet-id').value = wallet.id;
                document.getElementById('edit-wallet-name').value = wallet.name;
                document.getElementById('edit-wallet-color').value = wallet.color;
                document.getElementById('edit-wallet-balance').value = wallet.balance;

                const editWalletModal = new bootstrap.Modal(document.getElementById('editWalletModal'));
                editWalletModal.show();
            };
        }
    });

    document.getElementById('edit-wallet-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = Number(document.getElementById('edit-wallet-id').value);
        const name = document.getElementById('edit-wallet-name').value;
        const color = document.getElementById('edit-wallet-color').value;
        const balance = parseFloat(document.getElementById('edit-wallet-balance').value);

        const transaction = db.transaction(['wallets'], 'readwrite');
        const objectStore = transaction.objectStore('wallets');
        objectStore.put({id, name, color, balance});

        transaction.oncomplete = () => {
            loadWallets();
            populateCategoryAndWalletOptions()
            const editWalletModal = bootstrap.Modal.getInstance(document.getElementById('editWalletModal'));
            editWalletModal.hide();
        };
    });

    // Delete Wallet
    document.getElementById('wallets-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-wallet') || e.target.closest('.delete-wallet')) {
            if (confirm('Sei certo di voler eliminare questo wallet?')) {
                const id = Number(e.target.dataset.id);
                const transaction = db.transaction(['wallets'], 'readwrite');
                const objectStore = transaction.objectStore('wallets');
                objectStore.delete(id);

                transaction.oncomplete = () => {
                    populateCategoryAndWalletOptions();
                    loadWallets();
                };
            }
        }
    });

    function loadTransactions(page = 1) {
        if (!db) return;
        const transaction = db.transaction(['transactions'], 'readonly');
        const objectStore = transaction.objectStore('transactions');
        const request = objectStore.getAll();

        request.onsuccess = function (event) {
            const transactions = event.target.result;
            const transactionsList = document.getElementById('transactions-list');
            const start = (page - 1) * PAGE_SIZE;
            const end = start + PAGE_SIZE;
            const paginatedTransactions = transactions.slice(start, end);
            transactionsList.innerHTML = '';
            paginatedTransactions.forEach(transaction => {
                const item = document.createElement('li');
                item.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
                item.innerHTML = `<span>${transaction.date} - ${transaction.amount}</span> <span> <button class="btn btn-sm btn-warning edit-transaction" data-id="${transaction.id}"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger delete-transaction" data-id="${transaction.id}"><i class="fas fa-trash"></i></button> </span>`;
                transactionsList.appendChild(item);
            });
            // Pagination controls
            const paginationControls = document.getElementById('pagination-controls');
            paginationControls.innerHTML = '';
            const totalPages = Math.ceil(transactions.length / PAGE_SIZE);
            for (let i = 1; i <= totalPages; i++) {
                const pageButton = document.createElement('button');
                pageButton.classList.add('btn', 'btn-secondary', 'm-1');
                pageButton.textContent = i;
                if (i === page) {
                    pageButton.classList.add('btn-primary');
                }
                pageButton.addEventListener('click', () => {
                    loadTransactions(i);
                });
                paginationControls.appendChild(pageButton);
            }
        };
    }

    // Add Transaction
    document.getElementById('new-transaction-btn').addEventListener('click', () => {
        populateCategoryAndWalletOptions();
        const addTransactionModal = new bootstrap.Modal(document.getElementById('addTransactionModal'));
        addTransactionModal.show();
    });


    document.getElementById('add-transaction-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('transaction-amount').value);
        const date = document.getElementById('transaction-date').value;
        const type = document.getElementById('transaction-type').value;
        const category = parseInt(document.getElementById('transaction-category').value) || null;
        const wallet = parseInt(document.getElementById('transaction-wallet').value);

        const transaction = db.transaction(['transactions'], 'readwrite');
        const objectStore = transaction.objectStore('transactions');
        objectStore.add({amount, date, type, category, wallet});

        transaction.oncomplete = () => {
            loadTransactions();
            loadWallets();
            const addTransactionModal = bootstrap.Modal.getInstance(document.getElementById('addTransactionModal'));
            addTransactionModal.hide();
            document.getElementById('add-transaction-form').reset();
        };
    });

    // Edit Transaction
    document.getElementById('transactions-list').addEventListener('click', (e) => {
        const id = Number(e.target.dataset.id);
        const transaction = db.transaction(['transactions'], 'readonly');
        const objectStore = transaction.objectStore('transactions');
        const request = objectStore.get(id);

        request.onsuccess = (event) => {
            const transaction = event.target.result;
            document.getElementById('edit-transaction-id').value = transaction.id;
            document.getElementById('edit-transaction-amount').value = transaction.amount;
            document.getElementById('edit-transaction-date').value = transaction.date;
            document.getElementById('edit-transaction-type').value = transaction.type;
            document.getElementById('edit-transaction-category').value = transaction.category;
            document.getElementById('edit-transaction-wallet').value = transaction.wallet;

            const editTransactionModal = new bootstrap.Modal(document.getElementById('editTransactionModal'));
            editTransactionModal.show();
        };
    });

    document.getElementById('edit-transaction-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = Number(document.getElementById('edit-transaction-id').value);
        const amount = parseFloat(document.getElementById('edit-transaction-amount').value);
        const date = document.getElementById('edit-transaction-date').value;
        const type = document.getElementById('edit-transaction-type').value;
        const category = parseInt(document.getElementById('edit-transaction-category').value) || null;
        const wallet = parseInt(document.getElementById('edit-transaction-wallet').value);

        const transaction = db.transaction(['transactions'], 'readwrite');
        const objectStore = transaction.objectStore('transactions');
        objectStore.put({id, amount, date, type, category, wallet});

        transaction.oncomplete = () => {
            loadTransactions();
            loadWallets();
            const editTransactionModal = bootstrap.Modal.getInstance(document.getElementById('editTransactionModal'));
            editTransactionModal.hide();
        };
    });

    // Delete Transaction
    document.getElementById('transactions-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-transaction') || e.target.closest('.delete-transaction')) {
            if (!confirm('Sei sicuro di voler eliminare questa transazione?')) {
                const id = Number(e.target.dataset.id);
                const transaction = db.transaction([`transactions`], 'readwrite');
                const objectStore = transaction.objectStore('transactions');
                objectStore.delete(id);
                transaction.oncomplete = () => {
                    loadTransactions();
                    loadWallets();
                };
            }
        }
    });

    function populateCategoryAndWalletOptions() {
        // Populate categories
        const categoryTransaction = db.transaction(['categories'], 'readonly');
        const categoryObjectStore = categoryTransaction.objectStore('categories');
        const categoryRequest = categoryObjectStore.getAll();

        const makeOption = (v, l) => {
            const option = document.createElement('option');
            option.value = v;
            option.textContent = l;
            return option;
        }

        categoryRequest.onsuccess = function (event) {
            const categories = event.target.result;
            const transactionCategory = document.getElementById('transaction-category');
            const editTransactionCategory = document.getElementById('edit-transaction-category');
            transactionCategory.innerHTML = '<option value="">Select Category</option>';
            editTransactionCategory.innerHTML = '<option value="">Select Category</option>';
            categories.forEach(category => {
                transactionCategory.appendChild(makeOption(category.id, category.name));
                editTransactionCategory.appendChild(makeOption(category.id, category.name));
            });
        };

        // Populate wallets
        const walletTransaction = db.transaction(['wallets'], 'readonly');
        const walletObjectStore = walletTransaction.objectStore('wallets');
        const walletRequest = walletObjectStore.getAll();

        walletRequest.onsuccess = function (event) {
            const wallets = event.target.result;
            const transactionWallet = document.getElementById('transaction-wallet');
            const editTransactionWallet = document.getElementById('edit-transaction-wallet');
            transactionWallet.innerHTML = '<option value="">Select Wallet</option>';
            editTransactionWallet.innerHTML = '<option value="">Select Wallet</option>';
            wallets.forEach(wallet => {
                transactionWallet.appendChild(makeOption(wallet.id, wallet.name));
                editTransactionWallet.appendChild(makeOption(wallet.id, wallet.name));
            });
        };
    }

    function loadCategories() {
        if (!db) return;
        const transaction = db.transaction(['categories'], 'readonly');
        const objectStore = transaction.objectStore('categories');
        const request = objectStore.getAll();

        request.onsuccess = function (event) {
            const categories = event.target.result;
            const categoriesList = document.getElementById('categories-list');
            categoriesList.innerHTML = '';
            categories.forEach(category => {
                const item = document.createElement('li');
                item.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
                item.innerHTML = `
                    <span><i class="fas ${category.icon}" style="color:${category.color}"></i> ${category.name}</span>
                    <span>
                        <button class="btn btn-sm btn-warning edit-category" data-id="${category.id}"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger delete-category" data-id="${category.id}"><i class="fas fa-trash"></i></button>
                    </span>
                `;
                categoriesList.appendChild(item);
            });
        };
    }

// Initialize Icon Picker
    $('#icon-picker-button').iconpicker();
    $('#edit-icon-picker-button').iconpicker();

    $('#icon-picker-button').on('iconpickerSelected', function (event) {
        document.getElementById('category-icon').value = event.iconpickerValue;
    });

    $('#edit-icon-picker-button').on('iconpickerSelected', function (event) {
        document.getElementById('edit-category-icon').value = event.iconpickerValue;
    });

    // Add Category
    document.getElementById('new-category-btn').addEventListener('click', () => {
        const addCategoryModal = new bootstrap.Modal(document.getElementById('addCategoryModal'));
        addCategoryModal.show();
    });

    document.getElementById('add-category-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('category-name').value;
        const color = document.getElementById('category-color').value;
        const icon = document.getElementById('category-icon').value;

        const transaction = db.transaction(['categories'], 'readwrite');
        const objectStore = transaction.objectStore('categories');
        objectStore.add({name, color, icon});

        transaction.oncomplete = () => {
            loadCategories();
            populateCategoryAndWalletOptions();
            updateCharts();
            const addCategoryModal = bootstrap.Modal.getInstance(document.getElementById('addCategoryModal'));
            addCategoryModal.hide();
            document.getElementById('add-category-form').reset();
        };
    });

    // Edit Category
    document.getElementById('categories-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-category') || e.target.closest('.edit-category')) {
            const id = Number(e.target.dataset.id);
            const transaction = db.transaction(['categories'], 'readonly');
            const objectStore = transaction.objectStore('categories');
            const request = objectStore.get(id);

            request.onsuccess = (event) => {
                const category = event.target.result;
                document.getElementById('edit-category-id').value = category.id;
                document.getElementById('edit-category-name').value = category.name;
                document.getElementById('edit-category-color').value = category.color;
                document.getElementById('edit-category-icon').value = category.icon;

                const editCategoryModal = new bootstrap.Modal(document.getElementById('editCategoryModal'));
                editCategoryModal.show();
            };
        }
    });

    document.getElementById('edit-category-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = Number(document.getElementById('edit-category-id').value);
        const name = document.getElementById('edit-category-name').value;
        const color = document.getElementById('edit-category-color').value;
        const icon = document.getElementById('edit-category-icon').value;

        const transaction = db.transaction(['categories'], 'readwrite');
        const objectStore = transaction.objectStore('categories');
        objectStore.put({id, name, color, icon});

        transaction.oncomplete = () => {
            loadCategories();
            populateCategoryAndWalletOptions()
            updateCharts()
            const editCategoryModal = bootstrap.Modal.getInstance(document.getElementById('editCategoryModal'));
            editCategoryModal.hide();
        };
    });

    // Delete Category
    document.getElementById('categories-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-category') || e.target.closest('.delete-category')) {
            if (confirm('Sei sicuro di voler eliminare questa categoria?')) {
                const id = Number(e.target.dataset.id);
                const transaction = db.transaction(['categories'], 'readwrite');
                const objectStore = transaction.objectStore('categories');
                objectStore.delete(id);

                transaction.oncomplete = () => {
                    loadCategories();
                    populateCategoryAndWalletOptions()
                    updateCharts()
                };
            }
        }
    });


    // Initialize Charts
    const ctxExpenses = document.getElementById('expenses-chart').getContext('2d');
    const ctxIncomes = document.getElementById('incomes-chart').getContext('2d');
    const ctxBalance = document.getElementById('balance-chart').getContext('2d');

    const expensesChart = new Chart(ctxExpenses, {
        type: 'pie',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: []
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });

    const incomesChart = new Chart(ctxIncomes, {
        type: 'pie',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: []
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });

    const balanceChart = new Chart(ctxBalance, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Balance',
                data: [],
                fill: false,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });


    function updateCharts() {
        if (!db) return;

        const categoryTransaction = db.transaction(['categories'], 'readonly');
        const categoryObjectStore = categoryTransaction.objectStore('categories');
        const categoryRequest = categoryObjectStore.getAll();

        categoryRequest.onsuccess = function (event) {
            const categories = event.target.result;
            const categoryMap = {};
            categories.forEach(category => {
                categoryMap[category.id] = category;
            });

            const transactionTransaction = db.transaction(['transactions'], 'readonly');
            const transactionObjectStore = transactionTransaction.objectStore('transactions');
            const transactionRequest = transactionObjectStore.getAll();

            transactionRequest.onsuccess = function (event) {
                const transactions = event.target.result;

                // Initialize data structures for chart data
                const expenseData = {};
                const incomeData = {};
                const balanceData = {};
                const balanceLabels = [];
                let currentBalance = 0;

                // Get the current date
                const currentDate = new Date();

                // Initialize the last 12 months with 0 balance, including the current month
                for (let i = 11; i >= 0; i--) {
                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i +1, 1);
                    const month = date.toISOString().substring(0, 7); // Get YYYY-MM format
                    console.log(month)
                    balanceData[month] = 0;
                    balanceLabels.push(month);
                }

                // Process transactions and calculate balance for each month
                transactions.forEach(transaction => {
                    const month = transaction.date.substring(0, 7); // Get YYYY-MM format
                    if (balanceData[month] === undefined) {
                        balanceData[month] = 0;
                    }

                    if (transaction.type === 'income') {
                        if (!incomeData[transaction.category]) {
                            incomeData[transaction.category] = 0;
                        }
                        incomeData[transaction.category] += transaction.amount;
                        currentBalance += transaction.amount;
                    } else if (transaction.type === 'expense') {
                        if (!expenseData[transaction.category]) {
                            expenseData[transaction.category] = 0;
                        }
                        expenseData[transaction.category] += transaction.amount;
                        currentBalance -= transaction.amount;
                    }
                    balanceData[month] = currentBalance;
                });

                // Ensure balance data is cumulative
                let cumulativeBalance = 0;
                balanceLabels.forEach(month => {
                    if (balanceData[month] !== undefined) {
                        cumulativeBalance = balanceData[month];
                    }
                    balanceData[month] = cumulativeBalance;
                });

                // Update expenses pie chart
                expensesChart.data.labels = Object.keys(expenseData).map(id => categoryMap[id]?.name);
                expensesChart.data.datasets[0].data = Object.values(expenseData);
                expensesChart.data.datasets[0].backgroundColor = Object.keys(expenseData).map(id => categoryMap[id]?.color);
                expensesChart.update();

                // Update incomes pie chart
                incomesChart.data.labels = Object.keys(incomeData).map(id => categoryMap[id]?.name);
                incomesChart.data.datasets[0].data = Object.values(incomeData);
                incomesChart.data.datasets[0].backgroundColor = Object.keys(incomeData).map(id => categoryMap[id]?.color);
                incomesChart.update();

                // Update balance line chart
                balanceChart.data.labels = balanceLabels;
                balanceChart.data.datasets[0].data = balanceLabels.map(month => balanceData[month]);
                balanceChart.update();
            };
        };
    }

// Initial data load
    loadWallets();
    loadCategories();
    loadTransactions();
    updateCharts();

});
