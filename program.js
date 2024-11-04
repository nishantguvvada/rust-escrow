use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token::Token,
    token_interface::{
        close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TransferChecked,
    },
};

declare_id!("GarK4y9Qe5Sjrk3u26zDT1Y2M3nPcbUMA7gT6L98JtEn");

#[program]
pub mod escrow {
    use super::*;
    // init escrow account (PDA) and create an escrow ATA and transfer the token from user ATA to escrow ATA
    pub fn initialize(ctx: Context<InitializeEscrow>, seed: u64, amount: u64) -> Result<()> {
        ctx.accounts.escrow.seed = seed; // seed
        ctx.accounts.escrow.amount = amount; // amount to be transferred
        ctx.accounts.escrow.user = ctx.accounts.maker.key(); // user initiating the escrow
        ctx.accounts.escrow.mint = ctx.accounts.mint.key(); // mint

        let cpi_program = ctx.accounts.token_program.to_account_info();

        let cpi_accounts = TransferChecked {
            // transfer from maker ATA to escrow ATA
            from: ctx.accounts.maker_ata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.escrow_ata.to_account_info(),
            authority: ctx.accounts.maker.to_account_info(),
        };

        let result = transfer_checked(
            CpiContext::new(cpi_program.clone(), cpi_accounts),
            amount,
            ctx.accounts.mint.decimals,
        );

        match result {
            Ok(..) => print!("Success"),
            Err(..) => print!("Error"),
        };

        Ok(())
    }

    pub fn withdraw_escrow(ctx: Context<WithdrawEscrow>) -> Result<()> {

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.escrow_ata.to_account_info(),
            to: ctx.accounts.taker_ata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };

        let maker_binding = ctx.accounts.maker.to_account_info().key();
        let mint_binding = ctx.accounts.mint.to_account_info().key();
        let seed_binding = ctx.accounts.escrow.seed.to_le_bytes();

        let bump = &[ctx.bumps.escrow];
        let seeds = &[
            b"seed",
            seed_binding.as_ref(),
            maker_binding.as_ref(),
            mint_binding.as_ref(),
            bump
        ]; // seeds to build escrow ATA required for signing: seed, user and mint public key

        let signer_seeds = &[&seeds[..]];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            ),
            ctx.accounts.escrow_ata.amount,
            ctx.accounts.mint.decimals,
        )?;

        let cpi_close_accounts = CloseAccount {
            // closing the escrow ATA
            account: ctx.accounts.escrow_ata.to_account_info(),
            destination: ctx.accounts.maker.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };

        let signer_seeds = &[&seeds[..]];

        let close_result = close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_close_accounts,
            signer_seeds,
        ));

        match close_result {
            Ok(..) => print!("Success"),
            Err(..) => print!("Error"),
        };

        Ok(())
    }

    pub fn refund_maker(ctx: Context<RefundMaker>) -> Result<()> {

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.escrow_ata.to_account_info(),
            to: ctx.accounts.maker_ata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };

        let maker_binding = ctx.accounts.maker.to_account_info().key();
        let mint_binding = ctx.accounts.mint.to_account_info().key();
        let seed_binding = ctx.accounts.escrow.seed.to_le_bytes();

        let bump = &[ctx.bumps.escrow];
        let seeds = &[
            b"seed",
            seed_binding.as_ref(),
            maker_binding.as_ref(),
            mint_binding.as_ref(),
            bump,
        ]; // seeds to build escrow ATA required for signing: seed, user and mint public key

        let signer_seeds = &[&seeds[..]];

        transfer_checked(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds),
            ctx.accounts.escrow_ata.amount,
            ctx.accounts.mint.decimals,
        )?;

        let cpi_close_accounts = CloseAccount {
            account: ctx.accounts.escrow_ata.to_account_info(),
            destination: ctx.accounts.maker.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };

        let signer_seeds = &[&seeds[..]];

        let close_result = close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_close_accounts,
            signer_seeds,
        ));

        match close_result {
            Ok(..) => print!("Success"),
            Err(..) => print!("Error"),
        };

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(seed:u64)]
pub struct InitializeEscrow<'info> {
    #[account(
        init,
        payer = maker,
        seeds=[b"seed", seed.to_le_bytes().as_ref(), maker.key().as_ref(), mint.key().as_ref()],
        bump,
        space = 8 + 8 + 8 + 32 + 32
    )]
    pub escrow: Account<'info, Escrow>, // escrow account

    #[account(
        init,
        payer = maker,
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>, // escrow ATA

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>, // mint

    #[account(mut)]
    pub maker: Signer<'info>, // user

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = maker
    )]
    pub maker_ata: InterfaceAccount<'info, TokenAccount>, // user's ATA

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[account]
pub struct Escrow {
    pub seed: u64,
    pub amount: u64,
    pub user: Pubkey,
    pub mint: Pubkey,
}

#[derive(Accounts)]
pub struct WithdrawEscrow<'info> {
    // taker withdraws the amount from escrow
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>, // Box<> provides a pointer to the heap (memory management)

    #[account(
        mut,
        close = maker,
        seeds=[b"seed", escrow.seed.to_le_bytes().as_ref(), maker.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut, // init_if_needed and seeds not required because escrow ATA is already initialised
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = taker
    )]
    pub taker_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub taker: Signer<'info>, // taker is the signer because taker will now pay fees

    #[account(mut)]
    pub maker: SystemAccount<'info>, // SystemAccount validates owner to be system program

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)] // to create an associated token account, we need:
pub struct RefundMaker<'info> {
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>, // Box<> provides a pointer to the heap (memory management)

    #[account(
        mut,
        close = maker, // constraint handles everything required to securely close an account
        seeds=[b"seed", escrow.seed.to_le_bytes().as_ref(), maker.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = maker
    )]
    pub maker_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub maker: Signer<'info>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}
