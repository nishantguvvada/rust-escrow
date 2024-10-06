use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token::Token,
    token_interface::{
        close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TransferChecked,
    }, // Transfer as SplTransfer
};

declare_id!("EJamS2fTjyjPWAbWfZtchoyKtZz5szhiaZH1imAbNJHR");

#[program]
pub mod escrow {
    use super::*;

    // init escrow account (PDA) and create an escrow ATA and transfer the token from user ATA to escrow ATA
    pub fn escrow_transfer(
        ctx: Context<EscrowTransfer>,
        amount: u64,
        mint_address: Pubkey,
        seed: u64,
    ) -> Result<()> {
        ctx.accounts.escrow.amount = amount; // amount
        ctx.accounts.escrow.mint_address = mint_address; // public key of mint
        ctx.accounts.escrow.escrow_owner = ctx.accounts.maker.key(); // user initiating escrow
        ctx.accounts.escrow.seed = seed; //

        let cpi_program = ctx.accounts.token_program.to_account_info();

        let cpi_accounts = TransferChecked {
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

    pub fn taker_withdraw(ctx: Context<TakerWithdraw>) -> Result<()> {
        let mint = &ctx.accounts.mint;
        let maker = &ctx.accounts.maker;
        let _taker = &ctx.accounts.taker; // _ indicates unused variable
        let taker_ata = &ctx.accounts.taker_ata;
        let escrow = &ctx.accounts.escrow;
        let escrow_ata = &ctx.accounts.escrow_ata;
        let token_program = &ctx.accounts.token_program;

        let cpi_program = token_program.to_account_info();
        let cpi_accounts = TransferChecked {
            from: escrow_ata.to_account_info(),
            mint: mint.to_account_info(),
            to: taker_ata.to_account_info(),
            authority: escrow.to_account_info(),
        };

        let maker_binding = maker.to_account_info().key();
        let mint_binding = mint.to_account_info().key();

        let seeds = [b"seed", maker_binding.as_ref(), mint_binding.as_ref()]; // seeds to build escrow ATA required for signing: master_seed, user and mint public key

        transfer_checked(
            CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts, &[&seeds[..]]),
            escrow_ata.amount,
            mint.decimals,
        )?;

        let cpi_close_accounts = CloseAccount {
            // closing the escrow ATA
            account: escrow_ata.to_account_info(),
            destination: maker.to_account_info(),
            authority: escrow.to_account_info(),
        };

        let close_result = close_account(CpiContext::new_with_signer(
            cpi_program.clone(),
            cpi_close_accounts,
            &[&seeds[..]],
        ));

        match close_result {
            Ok(..) => print!("Success"),
            Err(..) => print!("Error"),
        };

        Ok(())
    }

    pub fn refund_maker(ctx: Context<RefundMaker>) -> Result<()> {
        let token_program = &ctx.accounts.token_program;
        let escrow = &ctx.accounts.escrow;
        let escrow_ata = &ctx.accounts.escrow_ata;
        let mint = &ctx.accounts.mint;
        let maker = &ctx.accounts.maker;
        let maker_ata = &ctx.accounts.maker_ata;

        let cpi_accounts = TransferChecked {
            from: escrow_ata.to_account_info(),
            mint: mint.to_account_info(),
            to: maker_ata.to_account_info(),
            authority: escrow.to_account_info(),
        };

        let cpi_program = token_program.to_account_info();

        let maker_binding = maker.to_account_info().key();
        let mint_binding = mint.to_account_info().key();

        let seeds = [b"seed", maker_binding.as_ref(), mint_binding.as_ref()]; // seeds to build escrow ATA required for signing: master_seed, user and mint public key

        transfer_checked(
            CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts, &[&seeds[..]]),
            escrow_ata.amount,
            mint.decimals,
        )?;

        let cpi_close_accounts = CloseAccount {
            account: escrow_ata.to_account_info(),
            destination: maker.to_account_info(),
            authority: escrow.to_account_info(),
        };

        let close_result = close_account(CpiContext::new_with_signer(
            cpi_program.clone(),
            cpi_close_accounts,
            &[&seeds[..]],
        ));

        match close_result {
            Ok(..) => print!("Success"),
            Err(..) => print!("Error"),
        };

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct EscrowTransfer<'info> {
    #[account(
        init_if_needed,
        payer = maker,
        seeds=[b"seed", maker.key().as_ref(), mint.key().as_ref()],
        bump,
        space = 8 + Escrow::INIT_SPACE,
    )]
    pub escrow: Account<'info, Escrow>, // escrow PDA

    #[account(
        init,
        payer = maker,
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>, // escrow ATA

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>, // mint to be transferred

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = maker
    )]
    pub maker_ata: InterfaceAccount<'info, TokenAccount>, // user's ATA

    #[account(mut)]
    pub maker: Signer<'info>, // user initiating the escrow

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub amount: u64,
    pub mint_address: Pubkey,
    pub escrow_owner: Pubkey,
    pub seed: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct TakerWithdraw<'info> {
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>, // Box<> provides a pointer to the heap (memory management)

    #[account(
        mut,
        close = maker,
        seeds=[b"seed", maker.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut, // init_if_needed and seeds not required because escrow ATA is already initialised
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub escrow_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint,
        associated_token::authority = taker
    )]
    pub taker_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub taker: Signer<'info>, // taker is the signer because taker will now pay fees

    pub maker: SystemAccount<'info>, // SystemAccount validates owner to be system program

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)] // to create an associated token account, we need:
pub struct RefundMaker<'info> {
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        close = maker, // constraint handles everything required to securely close an account
        seeds=[b"seed", maker.key().as_ref(), mint.key().as_ref()],
        bump
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
