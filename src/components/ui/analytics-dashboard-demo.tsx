import { useState, useEffect } from "react";
import AnalyticsDashboardCard from "@/components/ui/interactive-3d-analytics-dashboard-card";

const API = (import.meta.env.VITE_API_URL as string) || "http://localhost:8787";

interface Transaction {
    id: number;
    type: string;
    amount: number;
    package?: string;
    gameId?: string;
    timestamp: number;
}

interface CreditBalance {
    balance: number;
    totalSpent: number;
    transactions: Transaction[];
}

interface AnalyticsDashboardDemoProps {
    isAuthenticated?: boolean;
    authToken?: string;
}

export default function AnalyticsDashboardDemo({
    isAuthenticated = false,
    authToken = ""
}: AnalyticsDashboardDemoProps) {
    const [creditData, setCreditData] = useState<Array<{ month: string; value: number }>>([]);
    const [creditBalance, setCreditBalance] = useState(1000);
    const [totalCreditsSpent, setTotalCreditsSpent] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchCreditData = async () => {
            if (!isAuthenticated || !authToken) {
                // Use demo data for unauthenticated users
                setCreditData([
                    { month: 'Jan', value: 1000 },
                    { month: 'Feb', value: 900 },
                    { month: 'Mar', value: 800 },
                    { month: 'Apr', value: 700 },
                    { month: 'May', value: 600 },
                    { month: 'Jun', value: 500 },
                    { month: 'Jul', value: 400 }
                ]);
                setCreditBalance(1000);
                setTotalCreditsSpent(600);
                setIsLoading(false);
                return;
            }

            try {
                const headers = {
                    "Authorization": `Bearer ${authToken}`,
                    "Content-Type": "application/json"
                };

                // Fetch credit balance
                const balanceRes = await fetch(`${API}/credits/balance`, { headers });
                if (!balanceRes.ok) throw new Error("Failed to fetch credit balance");

                const balanceData: CreditBalance = await balanceRes.json();

                setCreditBalance(balanceData.balance);
                setTotalCreditsSpent(balanceData.totalSpent);

                // Generate chart data from transactions
                const transactions = balanceData.transactions || [];
                const monthlyData: { [key: string]: number } = {};
                let runningBalance = balanceData.balance;

                // Initialize last 7 months
                const now = new Date();
                for (let i = 6; i >= 0; i--) {
                    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const monthKey = date.toLocaleString('en', { month: 'short' });
                    monthlyData[monthKey] = runningBalance;
                }

                // Process transactions to build history
                const sortedTransactions = [...transactions].sort((a, b) => a.timestamp - b.timestamp);

                sortedTransactions.forEach((tx) => {
                    const txDate = new Date(tx.timestamp);
                    const monthKey = txDate.toLocaleString('en', { month: 'short' });

                    if (tx.type === 'purchase') {
                        runningBalance -= tx.amount;
                    } else if (tx.type === 'spend') {
                        runningBalance -= tx.amount; // amount is negative for spending
                    }

                    if (monthlyData[monthKey] !== undefined) {
                        monthlyData[monthKey] = runningBalance;
                    }
                });

                // Convert to array format for chart
                const chartData = Object.entries(monthlyData).map(([month, value]) => ({
                    month,
                    value: Math.max(0, value)
                }));

                setCreditData(chartData);
            } catch (err) {
                console.error("Error fetching credit data:", err);
                setError("Failed to load credit data");
                // Fallback to demo data
                setCreditData([
                    { month: 'Jan', value: 1000 },
                    { month: 'Feb', value: 900 },
                    { month: 'Mar', value: 800 },
                    { month: 'Apr', value: 700 },
                    { month: 'May', value: 600 },
                    { month: 'Jun', value: 500 },
                    { month: 'Jul', value: 400 }
                ]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCreditData();
    }, [isAuthenticated, authToken]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-black flex items-center justify-center p-6">
            <div className="space-y-8 w-full max-w-2xl">
                <AnalyticsDashboardCard
                    title="Credit Analytics"
                    subtitle="Your Credit Usage History"
                    initialData={creditData}
                />

                {/* Credit System Info */}
                <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Credit System Status</h3>
                    {error && (
                        <p className="text-sm text-red-500 mb-4">{error}</p>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Current Balance</p>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                {isLoading ? "..." : creditBalance.toLocaleString()}
                            </p>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Total Spent</p>
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                {isLoading ? "..." : totalCreditsSpent.toLocaleString()}
                            </p>
                        </div>
                    </div>

                    {/* Credit Packages Info */}
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Available Packages</p>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                            <div className="bg-gray-100 dark:bg-gray-700 rounded p-2 text-center">
                                <p className="font-semibold">Starter</p>
                                <p className="text-gray-500">500</p>
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-700 rounded p-2 text-center">
                                <p className="font-semibold">Basic</p>
                                <p className="text-gray-500">1K</p>
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-700 rounded p-2 text-center">
                                <p className="font-semibold">Pro</p>
                                <p className="text-gray-500">2.5K</p>
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-700 rounded p-2 text-center">
                                <p className="font-semibold">Elite</p>
                                <p className="text-gray-500">5K</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
