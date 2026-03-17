import { useRouter } from 'next/router';

const PatientProfile = () => {
    const router = useRouter();
    const { bookNumber } = router.query;

    // Helper to compute basePath from router.asPath
    const computeBasePath = () => {
        const currentPath = router.asPath;
        return currentPath.startsWith('/reception/') ? "/reception/patients/" : "/patients/" + bookNumber;
    };

    const basePath = computeBasePath();

    const handleTabClick = (tab) => {
        router.push(`${basePath}?tab=${tab}`, undefined, { shallow: true });
    };

    // Replace orth with ortho_card
    const handleTabReplace = (tab) => {
        if(tab === 'ortho') {
            router.replace(`${basePath}?tab=ortho_card`, undefined, { shallow: true });
        } else {
            handleTabClick(tab);
        }
    };

    // Example usage in JSX
    return (
        <div>
            <button onClick={() => handleTabReplace('ortho')}>Orthodontics</button>
            <button onClick={() => handleTabClick('general')}>General</button>
            <button onClick={() => handleTabClick('history')}>History</button>
            {/* Add more tabs as needed */}
        </div>
    );
};

export default PatientProfile;