import { observer } from 'mobx-react-lite';
import { MenuItem, Text } from '@deriv-com/ui';

const HomeIcon = () => (
    <svg width={20} height={20} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={1.6}>
        <path d='M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z' />
    </svg>
);
const DigitsIcon = () => (
    <svg width={20} height={20} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={1.6}>
        <circle cx='12' cy='12' r='8' />
        <path d='M12 8v4l3 2' />
    </svg>
);
const TradingViewIcon = () => (
    <svg width={20} height={20} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={1.6}>
        <path d='M3 17l5-6 4 3 5-8 4 5' />
        <path d='M3 21h18' />
    </svg>
);

export const MenuItems = observer(() => {
    return (
        <>
            <MenuItem as='a' className='app-header__menu' href='https://vexora-hub.vercel.app' leftComponent={HomeIcon}>
                <Text>Home</Text>
            </MenuItem>
            <MenuItem as='a' className='app-header__menu' href='https://vexora-three.vercel.app' leftComponent={DigitsIcon}>
                <Text>Digits</Text>
            </MenuItem>
            <MenuItem
                as='a'
                className='app-header__menu'
                href='https://www.tradingview.com/'
                target='_blank'
                rel='noopener noreferrer'
                leftComponent={TradingViewIcon}
            >
                <Text>TradingView</Text>
            </MenuItem>
        </>
    );
});

export const TradershubLink = observer(() => {
    return null;
});

type MenuItemsType = typeof MenuItems & {
    TradershubLink: typeof TradershubLink;
};

(MenuItems as MenuItemsType).TradershubLink = TradershubLink;

export default MenuItems as MenuItemsType;
