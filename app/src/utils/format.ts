export const formatSOL = (lamports: number): string => {
    return (lamports / 1_000_000_000).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    });
};

export const formatDate = (timestamp: number | Date): string => {
    const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : timestamp;
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
};

export const shortenAddress = (address: string, chars = 4): string => {
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};